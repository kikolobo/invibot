import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, memberships } from "@/db/schema";

/**
 * The single seam where authentication plugs in.
 *
 * Better Auth is not wired up yet, so in development this resolves to one
 * long-lived local organization. Everything downstream already goes through
 * `requireOrg()`, so swapping in a real session is a change to this file only.
 */

const DEV_USER_ID = "dev-user";
const DEV_ORG_SLUG = "dev";

export type Session = { userId: string; orgId: string };

export async function requireOrg(): Promise<Session> {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEV_SESSION) {
    throw new Error(
      "No authentication configured. Wire up Better Auth before deploying the organizer app.",
    );
  }

  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, DEV_ORG_SLUG),
  });
  if (existing) return { userId: DEV_USER_ID, orgId: existing.id };

  const [created] = await db
    .insert(organizations)
    .values({ name: "Organización de desarrollo", slug: DEV_ORG_SLUG, ownerUserId: DEV_USER_ID })
    .returning();

  await db
    .insert(memberships)
    .values({ orgId: created.id, userId: DEV_USER_ID, role: "owner" })
    .onConflictDoNothing();

  return { userId: DEV_USER_ID, orgId: created.id };
}
