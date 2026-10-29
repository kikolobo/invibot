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
