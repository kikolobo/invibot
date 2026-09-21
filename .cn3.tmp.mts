process.loadEnvFile(".env.local");
const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const { recordCompanionName } = await import("./lib/guests/companion");
const [g] = await sql`select id, full_name, companions from guests where party_size_allowed >= 2 and companions = '[]'::jsonb limit 1`;
console.log("fila de prueba:", g.full_name, JSON.stringify(g.companions));
for (const c of ["mi esposa Ana","se llama Luis Gómez","su novia ANA SOFIA lopez","AUN NO SE","todavía no lo he invitado","mi esposa","nadie","Ana Lopez","te aviso luego"]) {
  const r = await recordCompanionName(g.id, c);
  console.log(`  ${JSON.stringify(c).padEnd(30)} → ${r.ok ? "guarda " + JSON.stringify(r.name) : "no guarda (" + r.reason + ")"}`);
}
const [solo] = await sql`select id from guests where party_size_allowed < 2 limit 1`;
if (solo) console.log("  invitado sin +1 →", JSON.stringify(await recordCompanionName(solo.id, "Ana")));
await sql`update guests set companions='[]'::jsonb where id=${g.id}`;
console.log("restaurada:", JSON.stringify((await sql`select companions from guests where id=${g.id}`)[0].companions));
await sql.end();
