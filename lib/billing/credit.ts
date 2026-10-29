import type Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, payments } from "@/db/schema";
import { stripeFromEnv } from "./stripe";

const paymentFor = async (session: Stripe.Checkout.Session) =>
  db.query.payments.findFirst({ where: eq(payments.stripeSessionId, session.id) });

/** card, oxxo, customer_balance… — best effort, only for the record. */
async function methodOf(session: Stripe.Checkout.Session): Promise<string | null> {
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const stripe = stripeFromEnv();
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
      .set({ status: "paid", paidAt: new Date(), method, stripePaymentIntentId: intent ?? null })
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
