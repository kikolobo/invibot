import type Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, payments } from "@/db/schema";
import { modeOf, stripeFor } from "./stripe";

type PaymentRow = typeof payments.$inferSelect;

/**
 * Staff changes to what an event has paid for. Each one moves the payment's
 * status and the event's places in one transaction, and only from the state
 * it expects — so a double click, or a webhook arriving at the same time,
 * cannot take the same places off twice.
 *
 * Guests who were already reached keep their places either way: a place is
 * the guest's once anything was sent to them. What changes is how many more
 * can be reached.
 */

/** A payment made outside Stripe, recorded by staff: places on, as paid. */
export async function recordManualPayment(input: {
  eventId: string;
  slots: number;
  amountMinor: number;
  currency: string;
  note: string;
  byUserId: string;
}) {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .insert(payments)
      .values({
        eventId: input.eventId,
        userId: null,
        slots: input.slots,
        unitAmountMinor: input.slots ? Math.round(input.amountMinor / input.slots) : 0,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: "paid",
        method: "manual",
        note: input.note,
        paidAt: new Date(),
      })
      .returning();
    await tx
      .update(events)
      .set({ paidSlots: sql`${events.paidSlots} + ${input.slots}`, updatedAt: new Date() })
      .where(eq(events.id, input.eventId));
    return payment;
  });
}

/**
 * Marks a paid payment refunded or cancelled and takes its places back. Never
 * below zero: places already used by guests stay used.
 */
async function takeBack(
  payment: PaymentRow,
  to: "refunded" | "canceled",
  extra: { note?: string | null; stripeRefundId?: string | null; byUserId?: string | null },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [moved] = await tx
      .update(payments)
      .set({
        status: to,
        note: extra.note ?? payment.note,
        stripeRefundId: extra.stripeRefundId ?? payment.stripeRefundId,
        refundedAt: to === "refunded" ? new Date() : payment.refundedAt,
        canceledAt: new Date(),
        canceledByUserId: extra.byUserId ?? null,
      })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "paid")))
      .returning();
    if (!moved) return false;
    await tx
      .update(events)
      .set({ paidSlots: sql`greatest(0, ${events.paidSlots} - ${moved.slots})`, updatedAt: new Date() })
      .where(eq(events.id, moved.eventId));
    return true;
  });
}

export type AdjustResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Refunds a Stripe payment in full and takes its places back. The refund is
 * asked of Stripe first; only once Stripe accepts it does anything change
 * here, so a refused refund leaves the payment exactly as it was.
 */
export async function refundPayment(payment: PaymentRow, reason: string, byUserId: string): Promise<AdjustResult> {
  if (payment.status !== "paid") return { ok: false, error: "Sólo se reembolsa un pago pagado." };
  if (payment.method === "manual" || !payment.stripePaymentIntentId) {
    return { ok: false, error: "Este pago no pasó por Stripe; cancélalo y devuelve el dinero por donde llegó." };
  }
  // Refunded with the keys that took it, whatever mode new payments use now.
  const stripe = stripeFor(modeOf(payment.livemode));
  if (!stripe) return { ok: false, error: "Faltan las llaves de Stripe con las que se hizo este pago." };

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      reason: "requested_by_customer",
      metadata: { paymentId: payment.id, eventId: payment.eventId },
    });
  } catch (error) {
    const e = error as { message?: string; type?: string };
    if (e.type === "StripePermissionError") {
      return { ok: false, error: "La llave de Stripe no tiene permiso para reembolsar (Refunds: escritura)." };
    }
    return { ok: false, error: e.message ?? "Stripe no aceptó el reembolso." };
  }

  await takeBack(payment, "refunded", { note: reason, stripeRefundId: refund.id, byUserId });
  return {
    ok: true,
    message:
      refund.status === "succeeded"
        ? "Reembolsado. El dinero regresa a su tarjeta en 5 a 10 días hábiles."
        : "Reembolso solicitado a Stripe; se completa en unos días.",
  };
}

/**
 * Cancels without moving money: a manual payment, a goodwill reversal, or a
 * pending checkout (whose OXXO voucher or Stripe page stops working).
 */
export async function cancelPayment(payment: PaymentRow, reason: string, byUserId: string): Promise<AdjustResult> {
  if (payment.status === "paid") {
    const done = await takeBack(payment, "canceled", { note: reason, byUserId });
    return done
      ? { ok: true, message: "Cancelado y sin reembolso. Sus lugares se quitaron del evento." }
      : { ok: false, error: "El pago cambió mientras tanto. Recarga la página." };
  }

  if (payment.status === "pending") {
    const stripe = stripeFor(modeOf(payment.livemode));
    if (stripe && payment.stripeSessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(payment.stripeSessionId);
        if (session.payment_status === "paid") {
          return { ok: false, error: "Este pago ya se cobró. Recarga la página y reembólsalo si hace falta." };
        }
        if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      } catch (error) {
        console.error("[billing] could not expire session on cancel", payment.id, error);
      }
    }
    await db
      .update(payments)
      .set({ status: "canceled", note: reason, canceledAt: new Date(), canceledByUserId: byUserId })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
    return { ok: true, message: "Cancelado. Esa ficha o liga de pago ya no sirve." };
  }

  return { ok: false, error: "Este pago ya no está activo." };
}

/**
 * A refund made from Stripe's own dashboard, as the webhook reports it. Only a
 * full refund takes the places back; a partial one is a price adjustment and
 * leaves them.
 */
export async function syncRefundFromStripe(charge: Stripe.Charge) {
  if (!charge.refunded) return;
  const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!intent) return;
  const payment = await db.query.payments.findFirst({ where: eq(payments.stripePaymentIntentId, intent) });
  if (!payment || payment.status !== "paid") return;
  await takeBack(payment, "refunded", { note: payment.note ?? "Reembolsado desde Stripe" });
}
