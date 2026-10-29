import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * The dashboard's numbers, one aggregate query per subject. Written in SQL
 * with `filter` clauses so each subject is a single scan rather than a query
 * per tile.
 */

const one = async <T>(query: ReturnType<typeof sql>): Promise<T> => {
  const rows = (await db.execute(query)) as unknown as T[];
  return rows[0];
};

const many = async <T>(query: ReturnType<typeof sql>): Promise<T[]> =>
  (await db.execute(query)) as unknown as T[];

export type DashboardStats = Awaited<ReturnType<typeof dashboardStats>>;

export async function dashboardStats() {
  const [accounts, eventsRow, guestsRow, sendsRow, byKind, byTemplate, costs, conversation, perDay, topEvents] =
    await Promise.all([
      one<{
        total: number;
        new7: number;
        new30: number;
        active30: number;
        suspended: number;
        deleted: number;
        staff: number;
      }>(sql`
        select
          count(*) filter (where deleted_at is null)::int as total,
          count(*) filter (where deleted_at is null and created_at > now() - interval '7 days')::int as new7,
          count(*) filter (where deleted_at is null and created_at > now() - interval '30 days')::int as new30,
          count(*) filter (where deleted_at is null and (
            exists (select 1 from sign_ins i where i.user_id = users.id and i.impersonated_by is null
                    and i.created_at > now() - interval '30 days')
            or exists (select 1 from sessions s where s.user_id = users.id and s.impersonated_by is null
                    and s.updated_at > now() - interval '30 days')
          ))::int as active30,
          count(*) filter (where banned and deleted_at is null)::int as suspended,
          count(*) filter (where deleted_at is not null)::int as deleted,
          count(*) filter (where role <> 'user' and deleted_at is null)::int as staff
        from users
      `),
      one<{
        total: number;
        active: number;
        upcoming: number;
        upcoming30: number;
        past: number;
        archived: number;
        suspended: number;
        new30: number;
      }>(sql`
        select
          count(*)::int as total,
          count(*) filter (where archived_at is null)::int as active,
          count(*) filter (where archived_at is null and starts_at > now())::int as upcoming,
          count(*) filter (where archived_at is null and starts_at between now() and now() + interval '30 days')::int as upcoming30,
          count(*) filter (where archived_at is null and starts_at <= now())::int as past,
          count(*) filter (where archived_at is not null)::int as archived,
          count(*) filter (where suspended_at is not null)::int as suspended,
          count(*) filter (where created_at > now() - interval '30 days')::int as new30
        from events
      `),
      one<{
        total: number;
        approved: number;
        pending: number;
        confirmed: number;
        declined: number;
        noResponse: number;
        maybe: number;
        selfRegistered: number;
        seats: number;
      }>(sql`
        select
          count(*)::int as total,
          count(*) filter (where approval_status = 'approved')::int as approved,
          count(*) filter (where approval_status = 'pending')::int as pending,
          count(*) filter (where approval_status = 'approved' and rsvp_status = 'confirmed')::int as confirmed,
          count(*) filter (where approval_status = 'approved' and rsvp_status = 'declined')::int as declined,
          count(*) filter (where approval_status = 'approved' and rsvp_status = 'no_response')::int as "noResponse",
          count(*) filter (where approval_status = 'approved' and rsvp_status = 'maybe')::int as maybe,
          count(*) filter (where source = 'self')::int as "selfRegistered",
          coalesce(sum(coalesce(party_size_confirmed, 1)) filter (
            where approval_status = 'approved' and rsvp_status = 'confirmed'), 0)::int as seats
        from guests
      `),
      one<{
        total: number;
        last7: number;
        last30: number;
        template: number;
        freeform: number;
        delivered: number;
        read: number;
        failed: number;
        queued: number;
      }>(sql`
        select
          count(*)::int as total,
          count(*) filter (where queued_at > now() - interval '7 days')::int as last7,
          count(*) filter (where queued_at > now() - interval '30 days')::int as last30,
          count(*) filter (where template_name is not null)::int as template,
          count(*) filter (where template_name is null)::int as freeform,
          count(*) filter (where status in ('delivered', 'read'))::int as delivered,
          count(*) filter (where status = 'read')::int as read,
          count(*) filter (where status = 'failed')::int as failed,
          count(*) filter (where status = 'queued')::int as queued
        from sends
        where channel = 'whatsapp'
      `),
      many<{ kind: string; n: number; failed: number }>(sql`
        select kind, count(*)::int as n, count(*) filter (where status = 'failed')::int as failed
        from sends where channel = 'whatsapp'
        group by kind order by n desc
      `),
      many<{ template: string; n: number; failed: number; last30: number }>(sql`
        select template_name as template, count(*)::int as n,
          count(*) filter (where status = 'failed')::int as failed,
          count(*) filter (where queued_at > now() - interval '30 days')::int as last30
        from sends where channel = 'whatsapp' and template_name is not null
        group by template_name order by n desc
      `),
      many<{ category: string | null; currency: string | null; n: number; cost: number }>(sql`
        select pricing_category as category, cost_currency as currency, count(*)::int as n,
          coalesce(sum(cost_minor), 0)::int as cost
        from sends where channel = 'whatsapp' and status <> 'failed'
        group by pricing_category, cost_currency order by n desc
      `),
      one<{
        inbound: number;
        outbound: number;
        ai: number;
        tokensIn: number;
        tokensOut: number;
        inbound30: number;
        openQuestions: number;
        unmatched: number;
      }>(sql`
        select
          count(*) filter (where direction = 'inbound')::int as inbound,
          count(*) filter (where direction = 'outbound')::int as outbound,
          count(*) filter (where ai_generated)::int as ai,
          coalesce(sum(tokens_in), 0)::bigint::float8 as "tokensIn",
          coalesce(sum(tokens_out), 0)::bigint::float8 as "tokensOut",
          count(*) filter (where direction = 'inbound' and created_at > now() - interval '30 days')::int as inbound30,
          (select count(*)::int from escalations where status = 'open') as "openQuestions",
          (select count(*)::int from unmatched_inbound) as unmatched
        from messages
      `),
      many<{ day: string; sends: number; inbound: number }>(sql`
        with days as (
          select generate_series(
            date_trunc('day', now() at time zone 'America/Mexico_City') - interval '13 days',
            date_trunc('day', now() at time zone 'America/Mexico_City'),
            interval '1 day'
          ) as day
        )
        select to_char(d.day, 'YYYY-MM-DD') as day,
          (select count(*)::int from sends s
            where (s.queued_at at time zone 'America/Mexico_City') >= d.day
              and (s.queued_at at time zone 'America/Mexico_City') < d.day + interval '1 day') as sends,
          (select count(*)::int from messages m
            where m.direction = 'inbound'
              and (m.created_at at time zone 'America/Mexico_City') >= d.day
              and (m.created_at at time zone 'America/Mexico_City') < d.day + interval '1 day') as inbound
        from days d order by d.day desc
      `),
      many<{ id: string; name: string; n: number; owner: string | null }>(sql`
        select e.id, e.name, count(s.id)::int as n, u.email as owner
        from sends s
        join events e on e.id = s.event_id
        left join organizations o on o.id = e.org_id
        left join users u on u.id = o.owner_user_id
        where s.queued_at > now() - interval '30 days'
        group by e.id, e.name, u.email
        order by n desc limit 5
      `),
    ]);

  return {
    accounts,
    events: eventsRow,
    guests: guestsRow,
    sends: sendsRow,
    byKind,
    byTemplate,
    costs,
    conversation,
    perDay,
    topEvents,
  };
}
