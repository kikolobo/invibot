import Stripe from "stripe";

let client: Stripe | null | undefined;

/**
 * Built on first use, and null when this environment has no key — the same
 * contract as `anthropicFromEnv`: unconfigured is a feature switched off,
 * never a crash, and never a build that needs a secret to compile.
 */
export function stripeFromEnv(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  client = key ? new Stripe(key) : null;
  return client;
}

/** Live keys charge real money; the console says which one this is. */
export const stripeMode = (): "live" | "test" | null => {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : "test";
};

/**
 * The publishable key, read at request time and handed to the page, not a
 * NEXT_PUBLIC_ variable: those are frozen into the bundle at build time, so a
 * key added or rotated in Vercel would not reach the browser until the next
 * build. Null when it is missing or from the other mode than the secret key —
 * a test form against a live session fails at the last step, so better not to
 * show it at all.
 */
export function stripePublishableKey(): string | null {
  const key = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (!key) return null;
  const mode = stripeMode();
  if (mode && !key.startsWith(mode === "live" ? "pk_live_" : "pk_test_")) return null;
  return key;
}
