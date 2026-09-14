import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, memberships } from "@/db/schema";
import { auth } from "./index";

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
