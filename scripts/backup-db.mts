/**
 * A snapshot of every row, as files.
 *
 *   npx tsx scripts/backup-db.mts [--out <carpeta>]
 *
 * The first line of defence is a Neon branch, which is exact, instant and
 * costs nothing — see SERVICES.md. This is the second: a copy that survives
 * the Neon account itself, can be read by anything, and restores through
 * `restore-db.mts`, which is tested rather than hoped for.
 *
 * NDJSON rather than one big JSON: one row per line diffs, greps and streams,
 * and a half-written file loses the last row instead of all of them.
 *
 * ⚠️ It holds names, phone numbers and every message a guest ever sent. It is
 * written outside the repository on purpose; keep it that way.
 */
process.loadEnvFile(".env.local");

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL");

const stamp = new Date()
  .toISOString()
  .replace(/[:T]/g, "-")
  .slice(0, 16);

const flag = process.argv.indexOf("--out");
const out =
  flag > -1
    ? process.argv[flag + 1]
    : join(homedir(), "Documents/Development/Backups/invibot", stamp);

mkdirSync(out, { recursive: true });

const sql = postgres(url, { max: 1 });

const tables = (
  await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name`
).map((row) => row.table_name);

const counts: Record<string, number> = {};
for (const table of tables) {
  const rows = await sql`select * from ${sql(table)}`;
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(join(out, `${table}.ndjson`), rows.length > 0 ? `${body}\n` : "");
  counts[table] = rows.length;
}

// What the schema was when these rows were written. A restore replays the
// migrations up to this point; a backup that cannot say which point is a
// backup you have to guess at.
const migrations = await sql<{ id: number; hash: string; created_at: string }[]>`
  select id, hash, created_at from drizzle.__drizzle_migrations order by id`;

const [{ version }] = await sql<{ version: string }[]>`select version()`;

writeFileSync(
  join(out, "MANIFEST.json"),
  `${JSON.stringify(
    {
      takenAt: new Date().toISOString(),
      server: version,
      tables: counts,
      rows: Object.values(counts).reduce((total, n) => total + n, 0),
      migrationsApplied: migrations.length,
      lastMigration: migrations.at(-1)?.id ?? null,
    },
    null,
    2,
  )}\n`,
);

const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
console.log(`${total} filas · ${tables.length} tablas · ${migrations.length} migraciones`);
console.log(out);

await sql.end();
