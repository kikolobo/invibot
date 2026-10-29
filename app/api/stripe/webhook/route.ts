import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { stripeFor, stripeKeys, type StripeMode } from "@/lib/billing/stripe";
import { closeSession, creditSession, markAwaiting } from "@/lib/billing/credit";
import { getSettings } from "@/lib/site/settings";
import { syncRefundFromStripe } from "@/lib/billing/adjust";

/**
 * Stripe telling us how a payment went. The signature is checked against the
 * raw body before anything is believed: this endpoint is what turns money into
 * places, so an unsigned request is a free invitation run for anyone.
 *
 * Card payments arrive paid at `checkout.session.completed`. OXXO and SPEI
 * arrive unpaid there and settle later with `async_payment_succeeded` (or
 * `_failed`), which is why both paths credit.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // The sandbox and the live account each sign with their own secret, and
  // both may be pointed here at once. Each secret is tried until one checks
  // out: an event is believed only if one of ours signed it.
  const settings = await getSettings();
  const candidates: { mode: StripeMode; secret: string }[] = [];
  for (const mode of ["live", "test"] as const) {
    const stored = mode === "live" ? settings.stripeWebhookSecret : settings.stripeTestWebhookSecret;
    for (const secret of [stripeKeys(mode).webhookSecret, stored]) {
      if (secret && stripeFor(mode)) candidates.push({ mode, secret });
    }
  }
  if (!candidates.length) return new Response("Not configured", { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await request.text();
  let event: Stripe.Event | null = null;
  for (const { mode, secret } of candidates) {
    try {
      event = stripeFor(mode)!.webhooks.constructEvent(body, signature, secret);
      break;
    } catch {
      // Not this one; try the next.
    }
  }
  if (!event) {
    console.error("[stripe] no secret matched the signature");
    return new Response("Bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.payment_status === "paid") {
          await creditSession(session);
        } else {
          await markAwaiting(session);
        }
        const eventId = session.metadata?.eventId;
        if (eventId) revalidatePath(`/eventos/${eventId}/pago`);
        break;
      }
      case "checkout.session.async_payment_failed":
        await closeSession(event.data.object, "failed");
        break;
      case "checkout.session.expired":
        await closeSession(event.data.object, "expired");
        break;
      case "charge.refunded":
        await syncRefundFromStripe(event.data.object);
        break;
    }
  } catch (error) {
    // A 500 makes Stripe retry, which is what we want for a database hiccup;
    // crediting is idempotent, so the retry cannot double up.
    console.error("[stripe] could not handle", event.type, error);
    return new Response("Failed", { status: 500 });
  }

  return Response.json({ received: true });
}
