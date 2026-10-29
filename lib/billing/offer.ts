import { getSettings } from "@/lib/site/settings";
import { slotStatus } from "./slots";
import { stripeFromEnv, stripePublishableKey } from "./stripe";

/** Everything a pay control needs to draw itself, wherever it appears. */
export type PaymentOffer = {
  /** Places still missing for what the organizer is about to do; may be 0. */
  needed: number;
  /** What the quantity box starts at: what is missing, never under the minimum. */
  defaultSlots: number;
  unitAmountMinor: number;
  minimumSlots: number;
  currency: string;
  /** Null sends the buyer to Stripe's page instead of the in-page window. */
  publishableKey: string | null;
  /** False when this environment has no Stripe key at all. */
  configured: boolean;
};

/**
 * The offer for one event. `needed` defaults to the approved guests still
 * waiting for a place beyond those already available — which is how many the
 * next "Enviar invitaciones" would ask for.
 */
export async function paymentOffer(eventId: string, needed?: number): Promise<PaymentOffer> {
  const [settings, status] = await Promise.all([getSettings(), slotStatus(eventId)]);
  const missing = needed ?? Math.max(0, (status?.waiting ?? 0) - (status?.available ?? 0));
  return {
    needed: missing,
    defaultSlots: Math.max(missing, settings.minimumSlots),
    unitAmountMinor: settings.pricePerGuestMinor,
    minimumSlots: settings.minimumSlots,
    currency: settings.currency,
    publishableKey: stripePublishableKey(),
    configured: stripeFromEnv() !== null,
  };
}
