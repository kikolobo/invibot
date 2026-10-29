import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, memberships, users } from "@/db/schema";
import { auth } from "./index";
import { isPlatformRole, isStaff, type PlatformRole } from "./permissions";
import { getSettings } from "@/lib/site/settings";

export type Session = {
  userId: string;
  orgId: string;
  email: string;
  name: string;
};

export const getSession = cache(async () => {
  // `headers()` is awaited first on purpose. It is what marks the route
  // dynamic, and reaching into `auth` beforehand would build the auth instance
  // during static prerendering — before Next has been told this route cannot
  // be static at all.
  const requestHeaders = await headers();
  return auth.api.getSession({ headers: requestHeaders });
});

/**
 * Resolves the signed-in user's organization, creating it on first sign-in.
 *
 * Every customer gets an organization, including individuals — a personal org
 * of one. v1 exposes a single login per org; `memberships` already exists so
 * adding seats for planners is a feature rather than a migration.
 *
 * Wrapped in `cache()` so the layout and the page it wraps resolve the same
 * session once per request rather than racing each other to create the org.
 * The insert is still written to tolerate a genuine race between concurrent
 * requests — two tabs opened at once on a brand new account.
 */
export const requireOrg = cache(async (): Promise<Session> => {
  const session = await getSession();
  if (!session?.user) redirect("/entrar");
  // Suspending revokes every session, but the cookie cache can carry one for
  // up to a minute more. This closes that minute.
  if (session.user.banned || session.user.deletedAt) redirect("/entrar");
  // Maintenance shuts the organizer app for everyone but staff. Here rather
  // than in a layout, because every organizer page and action passes through
  // this and a layout does not guard a server action.
  if (!isStaff(session.user.role) && (await getSettings()).maintenance) redirect("/mantenimiento");

  const { id: userId, email, name } = session.user;

  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.ownerUserId, userId),
  });
  if (existing) return { userId, orgId: existing.id, email, name };

  // Deterministic slug from the full user id, so a concurrent insert collides
  // here and is swallowed instead of surfacing as a 500 on first sign-in.
  const [created] = await db
    .insert(organizations)
    .values({
      name: name || email,
      slug: `org-${userId}`,
      ownerUserId: userId,
    })
    .onConflictDoNothing()
    .returning();

  const org =
    created ??
    (await db.query.organizations.findFirst({
      where: eq(organizations.ownerUserId, userId),
    }));

  if (!org) throw new Error(`Could not resolve an organization for user ${userId}`);

  await db
    .insert(memberships)
    .values({ orgId: org.id, userId, role: "owner" })
    .onConflictDoNothing();

  return { userId, orgId: org.id, email, name };
});

export type StaffSession = {
  userId: string;
  email: string;
  name: string;
  role: Extract<PlatformRole, "admin" | "support">;
};

/**
 * For /admin. Anyone who is not staff gets a 404 rather than a refusal: the
 * console is not something a customer should learn exists.
 *
 * An impersonation session is the customer's, not staff's, so it is refused
 * too — an admin "viewing as" somebody has to come back before using this.
 *
 * The role is read from the database, not from the session. The session is
 * served from a cookie cache for up to a minute, and a minute of a demoted
 * admin still able to purge accounts is not a minute worth saving a query.
 */
export const requireStaff = cache(async (): Promise<StaffSession> => {
  const session = await getSession();
  if (!session?.user) redirect("/entrar");
  if (session.session.impersonatedBy) notFound();

  const current = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, email: true, name: true, role: true, banned: true, deletedAt: true },
  });
  if (!current || current.banned || current.deletedAt) notFound();
  if (!isPlatformRole(current.role) || !isStaff(current.role)) notFound();

  return {
    userId: current.id,
    email: current.email,
    name: current.name,
    role: current.role as StaffSession["role"],
  };
});

/** The same, for anything that changes an account. Support can only look. */
export async function requireAdmin(): Promise<StaffSession> {
  const staff = await requireStaff();
  if (staff.role !== "admin") notFound();
  return staff;
}
