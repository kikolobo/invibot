import postgres from "postgres";
import { normalizeGroupName, cleanGroupName } from "../lib/guests/groups";

/**
 * One-off backfill for migration 0002: converts the free-text `guests.group_label`
 * into real `guest_groups` rows and links each guest to one.
 *
 * Written in TypeScript rather than SQL so it uses the exact same
 * `normalizeGroupName` the application uses. Reimplementing that rule in SQL
 * would let the two drift, and the whole purpose of the table is that one name
 * means one group.
 *
 * Safe to run more than once.
 */
process.loadEnvFile(".env.local");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const rows = await sql<{ event_id: string; group_label: string }[]>`
  SELECT DISTINCT event_id, group_label FROM guests
  WHERE group_label IS NOT NULL AND btrim(group_label) <> ''`;

console.log(`found ${rows.length} distinct (event, label) pair(s)`);

for (const { event_id, group_label } of rows) {
  const name = cleanGroupName(group_label);
  const normalized = normalizeGroupName(group_label);
  if (!normalized) continue;

  const [group] = await sql<{ id: string }[]>`
    INSERT INTO guest_groups (event_id, name, normalized_name)
    VALUES (${event_id}, ${name}, ${normalized})
    ON CONFLICT (event_id, normalized_name) DO UPDATE SET name = guest_groups.name
    RETURNING id`;

  const updated = await sql`
    UPDATE guests SET group_id = ${group.id}
    WHERE event_id = ${event_id} AND group_label = ${group_label} AND group_id IS NULL
    RETURNING id`;

  console.log(`  "${group_label}" -> "${name}" (${normalized}) — ${updated.length} guest(s)`);
}

const [left] = await sql`
  SELECT count(*)::int AS n FROM guests
  WHERE group_label IS NOT NULL AND btrim(group_label) <> '' AND group_id IS NULL`;
console.log(`unlinked guests remaining: ${left.n} (expect 0)`);

await sql.end();
