process.loadEnvFile(".env.local");
const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const { recordCompanionName } = await import("./lib/guests/companion");
const [g] = await sql`select id from guests where party_size_allowed >= 2 and companions = '[]'::jsonb limit 1`;
for (const c of ["mi esposa","mi pareja","mi esposa Ana","Ana"]) {
  const r = await recordCompanionName(g.id, c);
  console.log(`${JSON.stringify(c).padEnd(18)} → ${r.ok ? "guarda " + JSON.stringify(r.name) : "no guarda"}`);
}
await sql`update guests set companions='[]'::jsonb where id=${g.id}`;
await sql.end();
