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
import { stripeFromEnv } from "./stripe";
import { redeemCode } from "./promo";
import { revalidatePath } from "next/cache";

export type CheckoutState = { error?: string };

/** The origin to send the buyer back to: this deployment, whichever host it is on. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Starts paying for places: a `pending` payment here, a Checkout Session at
 * Stripe, and the buyer sent to it. Nothing is credited until Stripe's
 * webhook says the money arrived — for OXXO and SPEI that can be days later.
 */
export async function startCheckout(
  eventId: string,
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const { userId, email } = await requireOrg();
  const access = await eventAccess(eventId);
  if (!access || !can(access, "event")) return { error: "No encontramos ese evento." };
  if (access.event.suspendedAt) return { error: "Este evento está pausado. Escríbenos." };

  const stripe = stripeFromEnv();
  if (!stripe) return { error: "Los pagos todavía no están configurados. Escríbenos." };

  const status = await slotStatus(eventId);
  if (status?.exempt) return { error: "Tu cuenta es de cortesía: no necesitas pagar." };

  const requested = Math.floor(Number(formData.get("slots")));
  if (!Number.isFinite(requested) || requested < 1 || requested > 5000) {
    return { error: "Escribe cuántos lugares quieres, de 1 a 5,000." };
  }

  const settings = await getSettings();
  const price = quote(requested, settings);

  // One Stripe customer per account, so SPEI can hand out a reference that
  // stays theirs and receipts land in one place.
  const account = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { stripeCustomerId: true, name: true },
  });
  let customer = account?.stripeCustomerId ?? null;
  if (!customer) {
    const created = await stripe.customers.create({
      email,
      name: account?.name || undefined,
      metadata: { userId },
    });
    customer = created.id;
    await db.update(users).set({ stripeCustomerId: customer }).where(eq(users.id, userId));
  }

  const [payment] = await db
    .insert(payments)
    .values({
      eventId,
      userId,
      slots: price.slots,
      unitAmountMinor: price.unitAmountMinor,
      amountMinor: price.amountMinor,
      currency: price.currency,
    })
    .returning();

  const base = await origin();
  let url: string | null = null;
  try {
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
      success_url: `${base}/eventos/${eventId}/pago?estado=listo`,
      cancel_url: `${base}/eventos/${eventId}/pago?estado=cancelado`,
    });
    await db.update(payments).set({ stripeSessionId: session.id }).where(eq(payments.id, payment.id));
    url = session.url;
  } catch (error) {
    console.error("[billing] could not start checkout", error);
    await db.update(payments).set({ status: "failed" }).where(eq(payments.id, payment.id));
    return { error: "No pudimos abrir el pago. Inténtalo otra vez en un momento." };
  }

  if (!url) return { error: "Stripe no devolvió a dónde ir. Inténtalo otra vez." };
  redirect(url);
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
