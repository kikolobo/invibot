import { and, count, desc, eq, gt, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  adminAudit,
  events,
  organizations,
  organizerInvites,
  organizers,
  sessions,
  users,
} from "@/db/schema";
import { variantsOf } from "@/lib/phone";

/**
 * Where an account stands. One at a time, in this order: you are suspended
 * before you are deleted, and deleted before you are purged.
 */
export type AccountStatus = "active" | "suspended" | "deleted";

export const statusLabels: Record<AccountStatus, string> = {
  active: "Activa",
  suspended: "Suspendida",
  deleted: "Eliminada",
};

export const statusOf = (user: { banned: boolean; deletedAt: Date | null }): AccountStatus =>
  user.deletedAt ? "deleted" : user.banned ? "suspended" : "active";

export type UserFilter = "all" | AccountStatus | "staff";

export const PAGE_SIZE = 50;

/*
 * Correlated subqueries are written out by hand. Drizzle renders a column
 * inside `sql` without its table, so `${users.id}` would become a bare "id"
 * and quietly bind to the subquery's own table instead of the outer row.
 */

/** Events owned through the user's organization. */
const ownedEvents = sql<number>`(
  select count(*)::int from events e
  join organizations o on o.id = e.org_id
  where o.owner_user_id = "users"."id"
)`;

/**
 * Events somebody else owns where this account has a seat. The `organizer`
 * role is a WhatsApp-only listing and never carries an account, so any seat
 * with a user id is an invitation that was accepted.
 */
const sharedEvents = sql<number>`(
  select count(*)::int from organizers r
  where r.user_id = "users"."id" and not r.is_owner
)`;

/** The newer of the last sign-in recorded and the last session touched. */
const lastSeen = sql<Date | null>`greatest(
  (select max(s.updated_at) from sessions s
    where s.user_id = "users"."id" and s.impersonated_by is null),
  (select max(i.created_at) from sign_ins i
    where i.user_id = "users"."id" and i.impersonated_by is null)
)`;

/**
 * The account list. "All" leaves the deleted out — they are kept, not
 * current — and has its own filter to find them.
 */
export async function listUsers({
  q,
  filter,
  page,
}: {
  q: string;
  filter: UserFilter;
  page: number;
}) {
  const term = q.trim();
  const search = term
    ? or(
        ilike(users.name, `%${term}%`),
        ilike(users.email, `%${term}%`),
        ilike(users.phone, `%${term.replace(/\D/g, "") || term}%`),
      )
    : undefined;

  const status = {
    all: isNull(users.deletedAt),
    active: and(isNull(users.deletedAt), eq(users.banned, false)),
    suspended: and(isNull(users.deletedAt), eq(users.banned, true)),
    deleted: isNotNull(users.deletedAt),
    staff: and(isNull(users.deletedAt), ne(users.role, "user")),
  }[filter];

  const where = and(status, search);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        banned: users.banned,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
        events: ownedEvents,
        sharedEvents,
        lastSeen,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset(Math.max(0, page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(users).where(where),
  ]);

  return { rows, total };
}

/** Everything the detail page shows about one account. */
export async function getUserDetail(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return null;

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.ownerUserId, userId),
  });

  const owner = alias(users, "owner");

  const [ownEvents, seats, invites, liveSessions, log] = await Promise.all([
    org
      ? db
          .select({
            id: events.id,
            name: events.name,
            startsAt: events.startsAt,
            timezone: events.timezone,
            archivedAt: events.archivedAt,
            guests: sql<number>`(select count(*)::int from guests g where g.event_id = "events"."id")`,
            sends: sql<number>`(select count(*)::int from sends x where x.event_id = "events"."id")`,
          })
          .from(events)
          .where(eq(events.orgId, org.id))
          .orderBy(desc(events.startsAt))
      : Promise.resolve([]),
    // Where they help run somebody else's event, and whose it is.
    db
      .select({
        id: organizers.id,
        role: organizers.role,
        isResponder: organizers.isResponder,
        joinedAt: organizers.createdAt,
        eventId: events.id,
        eventName: events.name,
        startsAt: events.startsAt,
        archivedAt: events.archivedAt,
        ownerId: owner.id,
        ownerName: owner.name,
        ownerEmail: owner.email,
      })
      .from(organizers)
      .innerJoin(events, eq(events.id, organizers.eventId))
      .innerJoin(organizations, eq(organizations.id, events.orgId))
      .innerJoin(owner, eq(owner.id, organizations.ownerUserId))
      .where(and(eq(organizers.userId, userId), eq(organizers.isOwner, false)))
      .orderBy(desc(events.startsAt)),
    // Invitations still waiting, addressed to their number. They become a
    // seat above the moment this account accepts them.
    user.phone
      ? db
          .select({
            id: organizerInvites.id,
            role: organizerInvites.role,
            sentAt: organizerInvites.sentAt,
            createdAt: organizerInvites.createdAt,
            eventId: events.id,
            eventName: events.name,
            invitedByName: owner.name,
            invitedByEmail: owner.email,
          })
          .from(organizerInvites)
          .innerJoin(events, eq(events.id, organizerInvites.eventId))
          .leftJoin(owner, eq(owner.id, organizerInvites.invitedByUserId))
          .where(inArray(organizerInvites.phoneE164, variantsOf(user.phone)))
          .orderBy(desc(organizerInvites.createdAt))
      : Promise.resolve([]),
    db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        impersonatedBy: sessions.impersonatedBy,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.updatedAt)),
    db
      .select({
        id: adminAudit.id,
        action: adminAudit.action,
        detail: adminAudit.detail,
        createdAt: adminAudit.createdAt,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(adminAudit)
      .leftJoin(users, eq(users.id, adminAudit.actorUserId))
      .where(eq(adminAudit.targetUserId, userId))
      .orderBy(desc(adminAudit.createdAt))
      .limit(50),
  ]);

  return { user, org, events: ownEvents, seats, invites, sessions: liveSessions, log };
}

/** The whole log, newest first. */
export async function listAudit({ page }: { page: number }) {
  return db
    .select({
      id: adminAudit.id,
      action: adminAudit.action,
      detail: adminAudit.detail,
      createdAt: adminAudit.createdAt,
      targetUserId: adminAudit.targetUserId,
      targetEmail: adminAudit.targetEmail,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(adminAudit)
    .leftJoin(users, eq(users.id, adminAudit.actorUserId))
    .orderBy(desc(adminAudit.createdAt))
    .limit(PAGE_SIZE)
    .offset(Math.max(0, page - 1) * PAGE_SIZE);
}
