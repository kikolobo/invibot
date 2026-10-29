"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, users } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { can, eventAccess } from "@/lib/events/access";
import { getSettings } from "@/lib/site/settings";
import { quote, slotStatus } from "./slots";
import { activeStripe, modeOf, stripeFor } from "./stripe";
import { redeemCode } from "./promo";
import { creditSession, markAwaiting } from "./credit";
import { revalidatePath } from "next/cache";

export type CheckoutState = { error?: string };

/** The origin to send the buyer back to: this deployment, whichever host it is on. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

type Opened = { error: string } | { url: string } | { clientSecret: string; paymentId: string };

/**
 * Opens a purchase: a `pending` payment here and a Checkout Session at
 * Stripe, either as Stripe's own page (`hosted`) or as the form that mounts
 * inside ours (`form`). Nothing is credited until Stripe says the money
 * arrived — for OXXO and SPEI that can be days later.
 */
/** Where the buyer comes back to: the payment page, or the guest list they were inviting from. */
export type ReturnTo = "pago" | "invitados";

async function openCheckout(
  eventId: string,
  requested: number,
  ui: "hosted" | "form",
  returnTo: ReturnTo = "pago",
): Promise<Opened> {
  const { userId, email } = await requireOrg();

  const active = await activeStripe();
  if (!active) return { error: "Los pagos todavía no están configurados. Escríbenos." };
  const stripe = active.stripe;
  if (!Number.isFinite(requested) || requested < 1 || requested > 5000) {
    return { error: "Escribe cuántos lugares quieres, de 1 a 5,000." };
  }

  // Side by side: the buyer is watching a spinner, and none of these needs
  // another's answer. Stripe's own call below is most of the wait anyway.
  const [access, status, settings, account] = await Promise.all([
    eventAccess(eventId),
    slotStatus(eventId),
    getSettings(),
    // One Stripe customer per account, so SPEI can hand out a reference that
    // stays theirs and receipts land in one place.
    db.query.users.findFirst({ where: eq(users.id, userId), columns: { stripeCustomerId: true, name: true } }),
  ]);
  if (!access || !can(access, "event")) return { error: "No encontramos ese evento." };
  if (access.event.suspendedAt) return { error: "Este evento está pausado. Escríbenos." };
  if (status?.exempt) return { error: "Tu cuenta es de cortesía: no necesitas pagar." };

  const price = quote(Math.floor(requested), settings);
  let customer = account?.stripeCustomerId ?? null;

  const [payment] = await db
    .insert(payments)
    .values({
      eventId,
      userId,
      slots: price.slots,
      unitAmountMinor: price.unitAmountMinor,
      amountMinor: price.amountMinor,
      currency: price.currency,
      livemode: active.mode === "live",
    })
    .returning();

  const base = await origin();
  const back = `${base}/eventos/${eventId}/${returnTo === "invitados" ? "invitados" : "pago"}`;
  try {
    if (!customer) {
      const created = await stripe.customers.create({ email, name: account?.name || undefined, metadata: { userId } });
      customer = created.id;
      await db.update(users).set({ stripeCustomerId: customer }).where(eq(users.id, userId));
    }

    // No payment_method_types: the methods are the ones switched on in the
    // Stripe dashboard (card, OXXO, bank transfer), so enabling one is a
    // setting rather than a deploy.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Fixed per flow, so the dashboard can compare this checkout over time.
      integration_identifier: "invibot-lugares-qhxtmwrb",
      customer,
      client_reference_id: payment.id,
      line_items: [
        {
          quantity: price.slots,
          price_data: {
            currency: price.currency.toLowerCase(),
            unit_amount: price.unitAmountMinor,
            product_data: {
              name: `Invitados para «${access.event.name}»`,
              description: "Invitaciones, confirmaciones, recordatorios y asistente por WhatsApp, por invitado.",
            },
          },
        },
      ],
      metadata: { paymentId: payment.id, eventId },
      payment_intent_data: { metadata: { paymentId: payment.id, eventId } },
      ...(ui === "form"
        ? { ui_mode: "form" as const, return_url: `${back}?pago=listo` }
        : { success_url: `${back}?pago=listo`, cancel_url: `${back}?pago=cancelado` }),
    });
    await db.update(payments).set({ stripeSessionId: session.id }).where(eq(payments.id, payment.id));

    if (ui === "form") {
      return session.client_secret
        ? { clientSecret: session.client_secret, paymentId: payment.id }
        : { error: "Stripe no devolvió el formulario. Inténtalo otra vez." };
    }
    return session.url ? { url: session.url } : { error: "Stripe no devolvió a dónde ir. Inténtalo otra vez." };
  } catch (error) {
    console.error("[billing] could not start checkout", error);
    await db.update(payments).set({ status: "failed" }).where(eq(payments.id, payment.id));
    return { error: "No pudimos abrir el pago. Inténtalo otra vez en un momento." };
  }
}

/** Stripe's own page, for when the embedded form cannot load. */
export async function startCheckout(
  eventId: string,
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const returnTo: ReturnTo = formData.get("returnTo") === "invitados" ? "invitados" : "pago";
  const opened = await openCheckout(eventId, Number(formData.get("slots")), "hosted", returnTo);
  if ("error" in opened) return opened;
  if ("url" in opened) redirect(opened.url);
  return { error: "No pudimos abrir el pago." };
}

/** The form that opens in a window over the payment page, without leaving Invibot. */
export async function startEmbeddedCheckout(
  eventId: string,
  slots: number,
  returnTo: ReturnTo = "pago",
): Promise<{ clientSecret?: string; paymentId?: string; error?: string }> {
  const opened = await openCheckout(eventId, slots, "form", returnTo === "invitados" ? "invitados" : "pago");
  if ("error" in opened) return { error: opened.error };
  if ("clientSecret" in opened) return { clientSecret: opened.clientSecret, paymentId: opened.paymentId };
  return { error: "No pudimos abrir el pago." };
}

/**
 * Right after the in-page form reports success: asks Stripe whether this
 * session is paid and, if so, credits it now instead of waiting for the
 * webhook, so the invitations the organizer was sending can go out at once.
 * The webhook still arrives later and finds nothing left to do.
 */
export async function settlePayment(
  eventId: string,
  paymentId: string,
): Promise<{ paid: boolean; waiting: boolean }> {
  await requireOrg();
  const access = await eventAccess(eventId);
  if (!access || !can(access, "event")) return { paid: false, waiting: false };

  const payment = await db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
  if (!payment || payment.eventId !== eventId || !payment.stripeSessionId) return { paid: false, waiting: false };
  if (payment.status === "paid") return { paid: true, waiting: false };

  const stripe = stripeFor(modeOf(payment.livemode));
  if (!stripe) return { paid: false, waiting: false };
  try {
    const session = await stripe.checkout.sessions.retrieve(payment.stripeSessionId);
    if (session.payment_status === "paid") {
      await creditSession(session);
      revalidatePath(`/eventos/${eventId}/pago`);
      return { paid: true, waiting: false };
    }
    if (session.status === "complete") {
      // OXXO or SPEI: finished at Stripe, money still on its way.
      await markAwaiting(session);
      return { paid: false, waiting: true };
    }
  } catch (error) {
    console.error("[billing] could not settle", paymentId, error);
  }
  return { paid: false, waiting: false };
}

export type RedeemState = { error?: string; ok?: string };

/** A courtesy code, typed on the event's payment page. */
export async function redeemPromo(eventId: string, _prev: RedeemState, formData: FormData): Promise<RedeemState> {
  const { userId } = await requireOrg();
  const access = await eventAccess(eventId);
  if (!access || !can(access, "event")) return { error: "No encontramos ese evento." };

  let result: Awaited<ReturnType<typeof redeemCode>>;
  try {
    result = await redeemCode(String(formData.get("code") ?? ""), userId, eventId);
  } catch (error) {
    console.error("[promo] redeem failed", error);
    return { error: "No pudimos validar el código. Inténtalo otra vez." };
  }
  if (!result.ok) return { error: result.error };

  revalidatePath(`/eventos/${eventId}/pago`);
  return { ok: `¡Listo! El código te dio ${result.slots} lugares en este evento.` };
}
