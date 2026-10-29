import type Stripe from "stripe";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, payments } from "@/db/schema";
import { modeOf, stripeFor } from "./stripe";

const paymentFor = async (session: Stripe.Checkout.Session) =>
  db.query.payments.findFirst({ where: eq(payments.stripeSessionId, session.id) });

/** card, oxxo, customer_balance… — best effort, only for the record. */
async function methodOf(session: Stripe.Checkout.Session): Promise<string | null> {
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const stripe = stripeFor(modeOf(session.livemode));
  if (!intent || !stripe) return null;
  try {
    const found = await stripe.paymentIntents.retrieve(intent, { expand: ["payment_method"] });
    const method = found.payment_method;
    return typeof method === "object" && method ? method.type : null;
  } catch {
    return null;
  }
}

/**
 * The money arrived: the payment becomes `paid` and its places land on the
 * event, in one transaction. Only a payment still `pending` moves, so Stripe
 * redelivering the same event — which it does — credits nothing twice.
 */
export async function creditSession(session: Stripe.Checkout.Session): Promise<boolean> {
  const payment = await paymentFor(session);
  if (!payment) {
    console.error("[billing] paid session with no payment row", session.id);
    return false;
  }
  const method = await methodOf(session);
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  return db.transaction(async (tx) => {
    const [moved] = await tx
      .update(payments)
      // The mode as Stripe reports it, which is the last word on which keys
      // must refund this — not only the mode that was active when it began.
      .set({ status: "paid", paidAt: new Date(), method, stripePaymentIntentId: intent ?? null, livemode: session.livemode })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")))
      .returning();
    if (!moved) return false;
    await tx
      .update(events)
      .set({ paidSlots: sql`${events.paidSlots} + ${moved.slots}`, updatedAt: new Date() })
      .where(eq(events.id, moved.eventId));
    return true;
  });
}

/** OXXO voucher not paid in time, a transfer that bounced, a session left to expire. */
export async function closeSession(session: Stripe.Checkout.Session, status: "failed" | "expired") {
  const payment = await paymentFor(session);
  if (!payment) return;
  await db
    .update(payments)
    .set({ status })
    .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
}

/**
 * Asks Stripe about this event's payments still marked pending, and credits
 * the ones that have settled. The webhook is the main road; this is the
 * backup for when it is down, misconfigured or simply slower than the buyer's
 * redirect back — so a person who just paid never sees zero places.
 *
 * Safe to call on every visit: crediting moves only `pending` payments, so a
 * payment the webhook already credited is left alone.
 */
export async function reconcilePending(eventId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pending = await db.query.payments.findMany({
    where: and(eq(payments.eventId, eventId), eq(payments.status, "pending"), gt(payments.createdAt, since)),
  });

  let credited = 0;
  for (const payment of pending) {
    // The keys that made it, whatever mode new payments use today.
    const stripe = stripeFor(modeOf(payment.livemode));
    if (!payment.stripeSessionId || !stripe) continue;
    try {
      const session = await stripe.checkout.sessions.retrieve(payment.stripeSessionId);
      if (session.payment_status === "paid") {
        if (await creditSession(session)) credited++;
      } else if (session.status === "complete") {
        await markAwaiting(session);
      } else if (session.status === "expired") {
        await closeSession(session, "expired");
      }
    } catch (error) {
      console.error("[billing] could not check session", payment.stripeSessionId, error);
    }
  }
  return credited;
}

/**
 * The buyer finished at Stripe but the money is still on its way — an OXXO
 * voucher or a SPEI reference. Recording the method is what tells this real
 * wait apart from a checkout somebody opened and walked away from: only the
 * first is shown to the organizer as "esperando".
 */
export async function markAwaiting(session: Stripe.Checkout.Session) {
  const payment = await paymentFor(session);
  if (!payment || payment.status !== "pending" || payment.method) return;
  const method = (await methodOf(session)) ?? "async";
  await db
    .update(payments)
    .set({ method })
    .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
}
