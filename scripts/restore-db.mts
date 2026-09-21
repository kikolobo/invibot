/**
 * Puts a backup back, row for row.
 *
 *   npx tsx scripts/restore-db.mts --from <carpeta>            # ensayo
 *   npx tsx scripts/restore-db.mts --from <carpeta> --apply    # de verdad
 *   npx tsx scripts/restore-db.mts --from <carpeta> --apply --to <url>
 *
 * Without `--to` it restores into `DATABASE_URL`, which is production — so
 * without `--apply` it does nothing but tell you what it would do, and with it
 * the target database has to be named out loud.
 *
 * What it does NOT do is create the schema: that is what `db/migrations` is
 * for, and the backup's MANIFEST says which migration it was taken at. Run
 * `npx drizzle-kit migrate` against the target first.
 *
 * The order is the whole trick. `guests` cannot be inserted before `events`,
 * and no list of tables written by hand survives the next migration — so the
 * order is read from the foreign keys themselves, every time.
 */
process.loadEnvFile(".env.local");

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const arg = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index > -1 ? (process.argv[index + 1] ?? null) : null;
};

const from = arg("--from");
if (!from) throw new Error("Falta --from <carpeta del respaldo>");

const apply = process.argv.includes("--apply");
const url = arg("--to") ?? process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL o --to");

const manifest = JSON.parse(readFileSync(join(from, "MANIFEST.json"), "utf8")) as {
  takenAt: string;
  tables: Record<string, number>;
  lastMigration: number | null;
};

const target = new URL(url);
console.log(`respaldo  ${from}`);
console.log(`tomado    ${manifest.takenAt} (migración ${manifest.lastMigration})`);
console.log(`destino   ${target.hostname}${target.pathname}`);

const sql = postgres(url, { max: 1 });

const present = new Set(
  (
    await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`
  ).map((row) => row.table_name),
);

const files = readdirSync(from)
  .filter((name) => name.endsWith(".ndjson"))
  .map((name) => name.replace(/\.ndjson$/, ""));

const missing = files.filter((table) => !present.has(table));
if (missing.length > 0) {
  throw new Error(
    `El destino no tiene estas tablas: ${missing.join(", ")}. Corre las migraciones primero.`,
  );
}

/**
 * Parents before children, worked out from the foreign keys.
 *
 * A cycle would loop forever, so it gives up and says so rather than
 * half-restoring: nothing here is worth guessing at.
 */
async function insertionOrder(tables: string[]): Promise<string[]> {
  const deps = new Map(tables.map((table) => [table, new Set<string>()]));

  const keys = await sql<{ child: string; parent: string }[]>`
    select c.relname as child, p.relname as parent
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_class p on p.oid = k.confrelid
    join pg_namespace n on n.oid = c.relnamespace
    where k.contype = 'f' and n.nspname = 'public'`;

  for (const { child, parent } of keys) {
    // Self-references resolve within a table, not between tables.
    if (child !== parent) deps.get(child)?.add(parent);
  }

  const ordered: string[] = [];
  const done = new Set<string>();
  while (ordered.length < tables.length) {
    const next = tables.filter(
      (table) => !done.has(table) && [...deps.get(table)!].every((parent) => done.has(parent)),
    );
    if (next.length === 0) {
      throw new Error(
        `Ciclo de llaves foráneas entre: ${tables.filter((t) => !done.has(t)).join(", ")}`,
      );
    }
    for (const table of next) {
      ordered.push(table);
      done.add(table);
    }
  }
  return ordered;
}

const order = await insertionOrder(files);

const rowsOf = (table: string): Record<string, unknown>[] => {
  const text = readFileSync(join(from, `${table}.ndjson`), "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line)) : [];
};

if (!apply) {
  console.log("\nEnsayo. Con --apply borraría y recargaría, en este orden:\n");
  for (const table of order) {
    console.log(`  ${String(manifest.tables[table] ?? 0).padStart(6)}  ${table}`);
  }
  console.log("\nNada fue modificado.");
  await sql.end();
  process.exit(0);
}

// One TRUNCATE for every table at once: Postgres then does not care about the
// order, and CASCADE cannot reach a table outside the list because the list is
// every table in the backup.
console.log("\nvaciando…");
await sql.unsafe(`truncate table ${order.map((t) => `"${t}"`).join(", ")} restart identity cascade`);

let total = 0;
for (const table of order) {
  const rows = rowsOf(table);
  if (rows.length === 0) continue;

  // In batches, because one statement with 300 rows of jsonb is fine and one
  // with 300 thousand is not.
  for (let index = 0; index < rows.length; index += 500) {
    await sql`insert into ${sql(table)} ${sql(rows.slice(index, index + 500))}`;
  }

  total += rows.length;
  console.log(`  ${String(rows.length).padStart(6)}  ${table}`);
}

console.log(`\n${total} filas restauradas.`);
await sql.end();
