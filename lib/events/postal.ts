"use server";

import data from "./postal-mx.json";

const { states, codes } = data as unknown as { states: string[]; codes: Record<string, [number, string]> };

/**
 * The city and state a Mexican postal code belongs to, for filling the venue
 * form. Null for a code GeoNames does not have — a handful of new ones — and
 * the organizer types them as before.
 *
 * Data: GeoNames (geonames.org), CC BY 4.0. Built by
 * `scripts/build-postal-codes-mx.mts`.
 */
export async function lookupPostalCode(code: string): Promise<{ city: string; state: string } | null> {
  const entry = codes[code.trim()];
  return entry ? { state: states[entry[0]], city: entry[1] } : null;
}
