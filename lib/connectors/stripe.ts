import type Stripe from "stripe";
import { getSettings } from "@/lib/site/settings";
import { activeMode, configuredModes, stripeFor, stripeKeys, type StripeMode } from "@/lib/billing/stripe";

/** What the webhook must hear about. Anything else is noise. */
export const STRIPE_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  // A refund made from Stripe's dashboard takes the places back here too.
  "charge.refunded",
];

/** The payment methods a Mexican buyer looks for, in the order shown. */
export const STRIPE_METHODS = [
  { key: "card", label: "Tarjeta" },
  { key: "oxxo", label: "OXXO" },
  { key: "customer_balance", label: "Transferencia SPEI" },
] as const;
export type StripeMethod = (typeof STRIPE_METHODS)[number]["key"];

export const webhookPath = "/api/stripe/webhook";

export type StripeConnector = {
  /** The mode new payments use, and which modes have keys at all. */
  mode: StripeMode;
  configured: Record<StripeMode, boolean>;
  /** Whether the active mode can open the in-page window. */
  publishable: boolean;
  error?: string;
  account?: {
    id: string;
    name: string | null;
    country: string | null;
    currency: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    pendingRequirements: number;
  };
  balance?: { available: number; pending: number; currency: string }[];
  webhook?: {
    id: string;
    url: string;
    status: string;
    missingEvents: string[];
    secretStored: boolean;
  } | null;
  /** Webhooks pointing somewhere else on this account, for the record. */
  otherWebhooks?: string[];
  methods?: {
    configurationId: string;
    items: { key: StripeMethod; label: string; available: boolean; preference: string }[];
  } | null;
};

/**
 * Everything the console shows about Stripe, read live. Each part fails on
 * its own: a key without balance permission still shows the account.
 */
export async function stripeConnector(): Promise<StripeConnector> {
  const mode = await activeMode();
  const configured = configuredModes();
  const result: StripeConnector = { mode, configured, publishable: Boolean(stripeKeys(mode).publishable) };
  // Everything below is about the active mode's account.
  const stripe = stripeFor(mode);
  if (!stripe) return result;

  const settings = await getSettings();
  const storedId = mode === "live" ? settings.stripeWebhookId : settings.stripeTestWebhookId;
  const storedSecret = mode === "live" ? settings.stripeWebhookSecret : settings.stripeTestWebhookSecret;

  try {
    const account = await stripe.accounts.retrieveCurrent();
    result.account = {
      id: account.id,
      name: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null,
      country: account.country ?? null,
      currency: account.default_currency ?? null,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      pendingRequirements: account.requirements?.currently_due?.length ?? 0,
    };
  } catch (error) {
    result.error = describe(error);
    return result;
  }

  const [balance, webhooks, configurations] = await Promise.allSettled([
    stripe.balance.retrieve(),
    stripe.webhookEndpoints.list({ limit: 100 }),
    stripe.paymentMethodConfigurations.list({ limit: 20 }),
  ]);

  if (balance.status === "fulfilled") {
    const currencies = new Set([
      ...balance.value.available.map((b) => b.currency),
      ...balance.value.pending.map((b) => b.currency),
    ]);
    result.balance = [...currencies].map((currency) => ({
      currency,
      available: balance.value.available.find((b) => b.currency === currency)?.amount ?? 0,
      pending: balance.value.pending.find((b) => b.currency === currency)?.amount ?? 0,
    }));
  }

  if (webhooks.status === "fulfilled") {
    const all = webhooks.value.data;
    const ours =
      all.find((endpoint) => endpoint.id === storedId) ??
      all.find((endpoint) => endpoint.url.endsWith(webhookPath));
    result.webhook = ours
      ? {
          id: ours.id,
          url: ours.url,
          status: ours.status,
          missingEvents: ours.enabled_events.includes("*")
            ? []
            : STRIPE_EVENTS.filter((event) => !ours.enabled_events.includes(event)),
          secretStored: Boolean(stripeKeys(mode).webhookSecret || (storedId === ours.id && storedSecret)),
        }
      : null;
    result.otherWebhooks = all.filter((endpoint) => endpoint.id !== ours?.id).map((endpoint) => endpoint.url);
  }

  if (configurations.status === "fulfilled") {
    // The default configuration is the one Checkout uses when none is named.
    const config =
      configurations.value.data.find((c) => c.is_default && !c.application) ?? configurations.value.data[0];
    result.methods = config
      ? {
          configurationId: config.id,
          items: STRIPE_METHODS.map((method) => {
            const entry = config[method.key] as
              | { available: boolean; display_preference: { preference: string; value: string } }
              | undefined;
            return {
              key: method.key,
              label: method.label,
              available: Boolean(entry?.available),
              preference: entry?.display_preference.value ?? "off",
            };
          }),
        }
      : null;
  }

  return result;
}

/** A Stripe error, in a sentence staff can act on. */
export function describe(error: unknown): string {
  const e = error as { type?: string; message?: string; code?: string };
  if (e?.type === "StripeAuthenticationError") return "La llave de Stripe no es válida.";
  if (e?.type === "StripePermissionError") {
    return `La llave no tiene permiso para esto: ${e.message ?? ""}`.trim();
  }
  return e?.message ?? "Stripe no respondió.";
}
