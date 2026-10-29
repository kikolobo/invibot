import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, organizations, payments, users } from "@/db/schema";
import { PAGE_SIZE } from "./users";

export type PaymentFilter = "all" | "paid" | "pending" | "closed";

/** Every purchase, newest first, with the event and who paid. */
export async function listPayments({ filter, page }: { filter: PaymentFilter; page: number }) {
  const where = {
    all: undefined,
    paid: eq(payments.status, "paid"),
    pending: eq(payments.status, "pending"),
    closed: sql`${payments.status} in ('failed', 'expired', 'refunded', 'canceled')`,
  }[filter];

  return db
    .select({
      id: payments.id,
      slots: payments.slots,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      status: payments.status,
      method: payments.method,
      livemode: payments.livemode,
      note: payments.note,
      stripePaymentIntentId: payments.stripePaymentIntentId,
      createdAt: payments.createdAt,
      paidAt: payments.paidAt,
      stripeSessionId: payments.stripeSessionId,
      eventId: events.id,
      eventName: events.name,
      ownerId: users.id,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(payments)
    .innerJoin(events, eq(events.id, payments.eventId))
    .innerJoin(organizations, eq(organizations.id, events.orgId))
    .innerJoin(users, eq(users.id, organizations.ownerUserId))
    .where(where)
    .orderBy(desc(payments.createdAt))
    .limit(PAGE_SIZE)
    .offset(Math.max(0, page - 1) * PAGE_SIZE);
}

/** Money in, places sold, and what talking to guests cost us in Claude. */
export async function salesStats() {
  const [sales] = (await db.execute(sql`
    select
      coalesce(sum(amount_minor) filter (where status = 'paid'), 0)::bigint::float8 as revenue,
      coalesce(sum(amount_minor) filter (where status = 'paid' and paid_at > now() - interval '30 days'), 0)::bigint::float8 as "revenue30",
      count(*) filter (where status = 'paid')::int as paid,
      coalesce(sum(slots) filter (where status = 'paid'), 0)::int as "slotsSold",
      count(*) filter (where status = 'pending' and stripe_session_id is not null)::int as pending,
      coalesce(sum(amount_minor) filter (where status = 'pending' and stripe_session_id is not null), 0)::bigint::float8 as "pendingAmount",
      count(distinct user_id) filter (where status = 'paid')::int as customers,
      max(currency) as currency
    -- Real money only: sandbox payments are play money. Manual payments
    -- recorded by staff count, since they are real money that came in another way.
    from payments where livemode or method = 'manual'
  `)) as unknown as {
    revenue: number;
    revenue30: number;
    paid: number;
    slotsSold: number;
    pending: number;
    pendingAmount: number;
    customers: number;
    currency: string | null;
  }[];

  const [ai] = (await db.execute(sql`
    select
      coalesce(sum(cost_micro_usd), 0)::bigint::float8 as cost,
      coalesce(sum(cost_micro_usd) filter (where created_at > now() - interval '30 days'), 0)::bigint::float8 as "cost30",
      count(*)::int as calls,
      count(*) filter (where source = 'guest_reply')::int as replies,
      count(distinct guest_id) filter (where source = 'guest_reply')::int as guests,
      coalesce(sum(cost_micro_usd) filter (where source = 'guest_reply'), 0)::bigint::float8 as "replyCost",
      coalesce(sum(cost_micro_usd) filter (where source = 'simulator'), 0)::bigint::float8 as "simulatorCost",
      min(created_at) as since
    from ai_usage
  `)) as unknown as {
    cost: number;
    cost30: number;
    calls: number;
    replies: number;
    guests: number;
    replyCost: number;
    simulatorCost: number;
    since: Date | null;
  }[];

  const [{ billed }] = (await db.execute(sql`
    select count(*)::int as billed from guests where billed_at is not null
  `)) as unknown as { billed: number }[];

  return { sales, ai, billed };
}
