import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Mexican mobile numbers historically carried an extra `1` after the country code on
 * WhatsApp (+521NNNNNNNNNN). Since the 2019 numbering change the canonical form drops it,
 * but Meta is inconsistent about which form it echoes back on webhooks — the `wa_id` on an
 * inbound message may not be byte-identical to what we sent to.
 *
 * So: store one canonical E.164 for display and billing, and store every plausible
 * variant for matching. Inbound lookups always go through `variantsOf`, never through an
 * equality check on the canonical value, or replies silently land in the void.
 */

export type NormalizedPhone = {
  e164: string;
  variants: string[];
  country: CountryCode | undefined;
};

export function normalizePhone(
  input: string,
  defaultCountry: CountryCode = "MX",
): NormalizedPhone | null {
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (!parsed?.isValid()) return null;

  const e164 = parsed.number;
  return { e164, variants: variantsOf(e164), country: parsed.country };
}

/**
 * Every form a provider might hand us back for the same number. Always a superset
 * containing `e164` itself.
 */
export function variantsOf(e164: string): string[] {
  const variants = new Set<string>([e164]);

  // +52 1 NNNNNNNNNN <-> +52 NNNNNNNNNN
  if (e164.startsWith("+521") && e164.length === 14) {
    variants.add("+52" + e164.slice(4));
  } else if (e164.startsWith("+52") && e164.length === 13) {
    variants.add("+521" + e164.slice(3));
  }

  // Meta's `wa_id` arrives without the leading +.
  for (const v of [...variants]) variants.add(v.replace(/^\+/, ""));

  return [...variants];
}

/** Display form for the organizer's guest list. */
export function formatPhone(e164: string, defaultCountry: CountryCode = "MX"): string {
  return parsePhoneNumberFromString(e164, defaultCountry)?.formatInternational() ?? e164;
}
