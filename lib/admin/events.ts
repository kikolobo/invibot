import { and, count, desc, eq, gt, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { broadcasts, events, organizations, organizers, payments, users } from "@/db/schema";
import { slotStatus } from "@/lib/billing/slots";
import { guestLimit } from "@/lib/limits";
import { PAGE_SIZE } from "./users";

export type EventFilter = "all" | "upcoming" | "past" | "archived" | "suspended";

/** Where an event stands, for the list. Suspension wins: it is what support asks about. */
export type EventState = "suspended" | "archived" | "upcoming" | "past";

export const eventStateLabels: Record<EventState, string> = {
  suspended: "Suspendido",
  archived: "Archivado",
  upcoming: "Próximo",
  past: "Pasado",
};

export const eventStateOf = (event: {
  suspendedAt: Date | null;
  archivedAt: Date | null;
  startsAt: Date;
}): EventState =>
  event.suspendedAt
    ? "suspended"
    : event.archivedAt
      ? "archived"
      : event.startsAt.getTime() > Date.now()
        ? "upcoming"
        : "past";

// Correlated counts, written out by hand for the reason given in ./users.ts.
const guestCount = sql<number>`(
  select count(*)::int from guests g
  where g.event_id = "events"."id" and g.approval_status = 'approved'
)`;
const confirmedCount = sql<number>`(
  select count(*)::int from guests g
  where g.event_id = "events"."id" and g.approval_status = 'approved' and g.rsvp_status = 'confirmed'
)`;
const sendCount = sql<number>`(select count(*)::int from sends x where x.event_id = "events"."id")`;

export async function listEvents({
  q,
  filter,
  page,
}: {
  q: string;
  filter: EventFilter;
  page: number;
}) {
  const term = q.trim();
  const now = new Date();
  const search = term
    ? or(
        ilike(events.name, `%${term}%`),
        ilike(users.email, `%${term}%`),
        ilike(users.name, `%${term}%`),
      )
    : undefined;

  const state = {
    all: undefined,
    upcoming: and(isNull(events.archivedAt), gt(events.startsAt, now)),
    past: and(isNull(events.archivedAt), lte(events.startsAt, now)),
    archived: isNotNull(events.archivedAt),
    suspended: isNotNull(events.suspendedAt),
  }[filter];

  const where = and(state, search);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: events.id,
        name: events.name,
        startsAt: events.startsAt,
        archivedAt: events.archivedAt,
        suspendedAt: events.suspendedAt,
        status: events.status,
        ownerId: users.id,
        ownerName: users.name,
        ownerEmail: users.email,
        guests: guestCount,
        confirmed: confirmedCount,
        sends: sendCount,
      })
      .from(events)
      .innerJoin(organizations, eq(organizations.id, events.orgId))
      .innerJoin(users, eq(users.id, organizations.ownerUserId))
      .where(where)
      // Upcoming first, soonest at the top; then the rest, most recent first.
      .orderBy(sql`(${events.startsAt} < now())`, sql`abs(extract(epoch from ${events.startsAt} - now()))`)
      .limit(PAGE_SIZE)
      .offset(Math.max(0, page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(events)
      .innerJoin(organizations, eq(organizations.id, events.orgId))
      .innerJoin(users, eq(users.id, organizations.ownerUserId))
      .where(where),
  ]);

  return { rows, total };
}

/** Everything support needs to answer a question about one event. */
export async function getEventDetail(eventId: string) {
  const [event] = await db
    .select({
      event: events,
      ownerId: users.id,
      ownerName: users.name,
      ownerEmail: users.email,
      ownerPhone: users.phone,
      ownerMaxGuests: users.maxGuestsPerEvent,
      ownerExempt: users.billingExempt,
    })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.orgId))
    .innerJoin(users, eq(users.id, organizations.ownerUserId))
    .where(eq(events.id, eventId));
  if (!event) return null;

  const rows = <T>(query: ReturnType<typeof sql>) =>
    db.execute(query) as unknown as Promise<T[]>;

  const [slots, purchases, [ai]] = await Promise.all([
    slotStatus(eventId),
    db.select().from(payments).where(eq(payments.eventId, eventId)).orderBy(desc(payments.createdAt)),
    rows<{ cost: number; replies: number; simulator: number; guests: number }>(sql`
      select
        coalesce(sum(cost_micro_usd), 0)::bigint::float8 as cost,
        count(*) filter (where source = 'guest_reply')::int as replies,
        count(*) filter (where source = 'simulator')::int as simulator,
        count(distinct guest_id) filter (where source = 'guest_reply')::int as guests
      from ai_usage where event_id = ${eventId}
    `),
  ]);

  const [guestStats, sendStats, byKind, byTemplate, failures, conversation, crew, messages, limit] =
    await Promise.all([
      rows<{
        total: number;
        approved: number;
        pending: number;
        rejected: number;
        confirmed: number;
        declined: number;
        maybe: number;
        noResponse: number;
        seats: number;
        optedOut: number;
        noPhone: number;
        invited: number;
        inviteFailed: number;
        selfRegistered: number;
      }>(sql`
        select
          count(*)::int as total,
          count(*) filter (where approval_status = 'approved')::int as approved,
          count(*) filter (where approval_status = 'pending')::int as pending,
          count(*) filter (where approval_status = 'rejected')::int as rejected,
          count(*) filter (where approval_status = 'approved' and rsvp_status = 'confirmed')::int as confirmed,
          count(*) filter (where approval_status = 'approved' and rsvp_status = 'declined')::int as declined,
          count(*) filter (where approval_status = 'approved' and rsvp_status = 'maybe')::int as maybe,
          count(*) filter (where approval_status = 'approved' and rsvp_status = 'no_response')::int as "noResponse",
          coalesce(sum(coalesce(party_size_confirmed, 1)) filter (
            where approval_status = 'approved' and rsvp_status = 'confirmed'), 0)::int as seats,
          count(*) filter (where opted_out)::int as "optedOut",
          count(*) filter (where phone_e164 is null)::int as "noPhone",
          count(*) filter (where invite_status in ('sent', 'delivered', 'read'))::int as invited,
          count(*) filter (where invite_status = 'failed')::int as "inviteFailed",
          count(*) filter (where source = 'self')::int as "selfRegistered"
        from guests where event_id = ${eventId}
      `),
      rows<{
        total: number;
        template: number;
        freeform: number;
        delivered: number;
        read: number;
        failed: number;
        queued: number;
        cost: number;
        currency: string | null;
        last: Date | null;
      }>(sql`
        select
          count(*)::int as total,
          count(*) filter (where template_name is not null)::int as template,
          count(*) filter (where template_name is null)::int as freeform,
          count(*) filter (where status in ('delivered', 'read'))::int as delivered,
          count(*) filter (where status = 'read')::int as read,
          count(*) filter (where status = 'failed')::int as failed,
          count(*) filter (where status = 'queued')::int as queued,
          coalesce(sum(cost_minor), 0)::int as cost,
          max(cost_currency) as currency,
          max(queued_at) as last
        from sends where event_id = ${eventId}
      `),
      rows<{ kind: string; n: number; failed: number }>(sql`
        select kind, count(*)::int as n, count(*) filter (where status = 'failed')::int as failed
        from sends where event_id = ${eventId} group by kind order by n desc
      `),
      rows<{ template: string; n: number; failed: number }>(sql`
        select template_name as template, count(*)::int as n,
          count(*) filter (where status = 'failed')::int as failed
        from sends where event_id = ${eventId} and template_name is not null
        group by template_name order by n desc
      `),
      // The errors themselves, grouped: "131026 · undeliverable" twelve times
      // is the answer to "why did my aunt not get it".
      rows<{ code: string | null; title: string | null; n: number; last: Date }>(sql`
        select error_code as code, error_title as title, count(*)::int as n, max(queued_at) as last
        from sends where event_id = ${eventId} and status = 'failed'
        group by error_code, error_title order by n desc limit 10
      `),
      rows<{
        conversations: number;
        inbound: number;
        outbound: number;
        ai: number;
        lastInbound: Date | null;
        openQuestions: number;
        answeredQuestions: number;
      }>(sql`
        select
          (select count(*)::int from conversations c where c.event_id = ${eventId}) as conversations,
          count(*) filter (where m.direction = 'inbound')::int as inbound,
          count(*) filter (where m.direction = 'outbound')::int as outbound,
          count(*) filter (where m.ai_generated)::int as ai,
          max(m.created_at) filter (where m.direction = 'inbound') as "lastInbound",
          (select count(*)::int from escalations e where e.event_id = ${eventId} and e.status = 'open') as "openQuestions",
          (select count(*)::int from escalations e where e.event_id = ${eventId} and e.status <> 'open') as "answeredQuestions"
        from messages m join conversations c on c.id = m.conversation_id
        where c.event_id = ${eventId}
      `),
      db
        .select({
          id: organizers.id,
          fullName: organizers.fullName,
          phone: organizers.phoneE164,
          role: organizers.role,
          isOwner: organizers.isOwner,
          isResponder: organizers.isResponder,
          userId: organizers.userId,
          lastInboundAt: organizers.lastInboundAt,
        })
        .from(organizers)
        .where(eq(organizers.eventId, eventId))
        .orderBy(desc(organizers.isOwner), organizers.fullName),
      db
        .select({
          id: broadcasts.id,
          title: broadcasts.title,
          status: broadcasts.status,
          isTest: broadcasts.isTest,
          scheduledFor: broadcasts.scheduledFor,
          sentAt: broadcasts.sentAt,
          createdAt: broadcasts.createdAt,
          recipients: sql<number>`(select count(*)::int from broadcast_recipients r where r.broadcast_id = "broadcasts"."id")`,
        })
        .from(broadcasts)
        .where(and(eq(broadcasts.eventId, eventId), eq(broadcasts.isTest, false)))
        .orderBy(desc(broadcasts.createdAt))
        .limit(20),
      guestLimit(eventId),
    ]);

  return {
    ...event,
    guests: guestStats[0],
    sends: sendStats[0],
    byKind,
    byTemplate,
    failures,
    conversation: conversation[0],
    crew,
    messages,
    limit,
    slots,
    purchases,
    ai,
  };
}
