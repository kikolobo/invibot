import Stripe from "stripe";
import { getSettings } from "@/lib/site/settings";

/**
 * Two Stripe accounts side by side — the sandbox and the real one — and a
 * switch in the admin to say which one takes payments. Both sets of keys live
 * in the environment under their own names, so flipping the switch needs no
 * deploy and no secret ever passes through the database.
 *
 * Every payment remembers which side it was made on (`payments.livemode`), so
 * refunding or checking one always uses the keys that made it, whatever the
 * switch says today.
 */
export type StripeMode = "test" | "live";

export const stripeModeLabels: Record<StripeMode, string> = { test: "Sandbox", live: "Live" };

const read = (name: string) => process.env[name]?.trim() || null;

const isTestKey = (key: string) => /^(sk|rk|pk)_test_/.test(key);

/**
 * The keys for one mode. The per-mode names win; the older single names
 * (STRIPE_SECRET_KEY, …) still count, filed under whichever mode their prefix
 * says, so an environment set up before the switch keeps working.
 */
export function stripeKeys(mode: StripeMode) {
  const prefix = mode === "test" ? "STRIPE_TEST_" : "STRIPE_LIVE_";
  const legacySecret = read("STRIPE_SECRET_KEY");
  const legacyPublishable = read("STRIPE_PUBLISHABLE_KEY");
  const legacyMatches = (key: string | null) => Boolean(key && isTestKey(key) === (mode === "test"));

  const secret = read(`${prefix}SECRET_KEY`) ?? (legacyMatches(legacySecret) ? legacySecret : null);
  const publishable =
    read(`${prefix}PUBLISHABLE_KEY`) ?? (legacyMatches(legacyPublishable) ? legacyPublishable : null);
  // `stripe listen` prints one for local work, and it is always test mode.
  const webhookSecret =
    read(`${prefix}WEBHOOK_SECRET`) ?? (mode === "test" ? read("STRIPE_WEBHOOK_SECRET") : null);

  return {
    secret,
    // A publishable key from the other mode fails at the last step of paying,
    // so it is treated as missing rather than shown.
    publishable: publishable && isTestKey(publishable) === (mode === "test") ? publishable : null,
    webhookSecret,
  };
}

const clients: Partial<Record<StripeMode, Stripe | null>> = {};

/** The client for one mode, built on first use; null when that mode has no key. */
export function stripeFor(mode: StripeMode): Stripe | null {
  if (mode in clients) return clients[mode] ?? null;
  const { secret } = stripeKeys(mode);
  clients[mode] = secret ? new Stripe(secret) : null;
  return clients[mode] ?? null;
}

export const modeOf = (livemode: boolean): StripeMode => (livemode ? "live" : "test");

export const configuredModes = (): Record<StripeMode, boolean> => ({
  test: Boolean(stripeKeys("test").secret),
  live: Boolean(stripeKeys("live").secret),
});

/**
 * Pins this environment to one mode, above the admin's switch. The switch
 * lives in the database, and local and production share one: without this, a
 * developer's machine holding live keys would charge real cards whenever the
 * admin chose Live. `.env.local` sets it to `test`; production leaves it unset.
 */
export const pinnedMode = (): StripeMode | null => {
  const value = read("STRIPE_MODE")?.toLowerCase();
  return value === "test" || value === "live" ? value : null;
};

/**
 * The mode new payments are taken in: this environment's pin, else the
 * admin's choice, or — until someone makes one — live when live keys exist,
 * else the sandbox.
 */
export async function activeMode(): Promise<StripeMode> {
  const pinned = pinnedMode();
  if (pinned) return pinned;
  const chosen = (await getSettings()).stripeMode;
  if (chosen === "test" || chosen === "live") return chosen;
  return configuredModes().live ? "live" : "test";
}

/** The client new payments go through, with its mode; null when that mode has no key. */
export async function activeStripe(): Promise<{ stripe: Stripe; mode: StripeMode } | null> {
  const mode = await activeMode();
  const stripe = stripeFor(mode);
  return stripe ? { stripe, mode } : null;
}

/**
 * The publishable key for the active mode, read at request time and handed to
 * the page — not a NEXT_PUBLIC_ variable, which is frozen into the bundle at
 * build time, so a key added or the mode flipped would not reach the browser
 * until the next build.
 */
export async function activePublishableKey(): Promise<string | null> {
  return stripeKeys(await activeMode()).publishable;
}

const accountIds: Partial<Record<StripeMode, Promise<string | null>>> = {};

/**
 * The Stripe account behind each mode — a sandbox is an account of its own —
 * so a dashboard link opens the right one instead of whichever account the
 * browser last had selected. Asked once per mode per server instance.
 */
export function stripeAccountId(mode: StripeMode): Promise<string | null> {
  accountIds[mode] ??= (async () => {
    const stripe = stripeFor(mode);
    if (!stripe) return null;
    try {
      return (await stripe.accounts.retrieveCurrent()).id;
    } catch {
      return null;
    }
  })();
  return accountIds[mode]!;
}

export async function stripeAccountIds(): Promise<Record<StripeMode, string | null>> {
  const [test, live] = await Promise.all([stripeAccountId("test"), stripeAccountId("live")]);
  return { test, live };
}
