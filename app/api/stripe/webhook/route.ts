import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { stripeFromEnv } from "@/lib/billing/stripe";
import { closeSession, creditSession } from "@/lib/billing/credit";
import { getSettings } from "@/lib/site/settings";

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
  const stripe = stripeFromEnv();
  // The variable wins; otherwise the secret Stripe returned when the admin
  // created this endpoint from Conectores.
  const secret =
    process.env.STRIPE_WEBHOOK_SECRET?.trim() || (await getSettings()).stripeWebhookSecret || undefined;
  if (!stripe || !secret) return new Response("Not configured", { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch (error) {
    console.error("[stripe] bad signature", error);
    return new Response("Bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.payment_status === "paid") {
          await creditSession(session);
          const eventId = session.metadata?.eventId;
          if (eventId) revalidatePath(`/eventos/${eventId}/pago`);
        }
        break;
      }
      case "checkout.session.async_payment_failed":
        await closeSession(event.data.object, "failed");
        break;
      case "checkout.session.expired":
        await closeSession(event.data.object, "expired");
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
