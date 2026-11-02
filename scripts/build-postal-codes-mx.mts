import { readFileSync, writeFileSync } from "node:fs";

/**
 * Builds `lib/events/postal-mx.json` — Mexican postal code → state and city —
 * from GeoNames' MX file.
 *
 * GeoNames rather than SEPOMEX's own catalogue: SEPOMEX's terms allow private
 * use only and forbid redistribution, and this table answers lookups for every
 * organizer. GeoNames publishes the same codes under CC BY 4.0, which allows
 * commercial use with credit — given beside the field that uses it.
 *
 *   curl -O https://download.geonames.org/export/zip/MX.zip && unzip MX.zip
 *   npx tsx scripts/build-postal-codes-mx.mts path/to/MX.txt
 *
 * Run again now and then; codes change slowly.
 */
const source = process.argv[2];
if (!source) {
  console.error("usage: tsx scripts/build-postal-codes-mx.mts path/to/MX.txt");
  process.exit(1);
}

/** GeoNames writes the official long names; the form offers the everyday ones. */
const stateNames: Record<string, string> = {
  "Distrito Federal": "Ciudad de México",
  México: "Estado de México",
  "Coahuila de Zaragoza": "Coahuila",
  "Michoacán de Ocampo": "Michoacán",
  "Veracruz de Ignacio de la Llave": "Veracruz",
};

// code → city → how many settlements name it, to pick the usual one.
const seen = new Map<string, { state: string; cities: Map<string, number> }>();

for (const line of readFileSync(source, "utf8").split("\n")) {
  const columns = line.split("\t");
  if (columns.length < 9 || columns[0] !== "MX") continue;
  const [, code, , rawState, , municipality, , city] = columns;
  const state = stateNames[rawState] ?? rawState;
  // The city when GeoNames has one; otherwise the municipality, which is what
  // a rural venue's address names.
  const place = (city || municipality).trim();
  if (!/^\d{5}$/.test(code) || !place) continue;

  const entry = seen.get(code) ?? { state, cities: new Map() };
  entry.cities.set(place, (entry.cities.get(place) ?? 0) + 1);
  seen.set(code, entry);
}

const states = [...new Set([...seen.values()].map((entry) => entry.state))].sort();
const codes: Record<string, [number, string]> = {};
for (const [code, { state, cities }] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
  const [city] = [...cities].sort((a, b) => b[1] - a[1])[0];
  codes[code] = [states.indexOf(state), city];
}

writeFileSync("lib/events/postal-mx.json", JSON.stringify({ states, codes }));
console.log(`${Object.keys(codes).length} codes, ${states.length} states`);
