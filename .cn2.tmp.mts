process.loadEnvFile(".env.local");
const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const { recordCompanionName } = await import("./lib/guests/companion");
// A real row, restored afterwards.
const [g] = await sql`select id, full_name, companions, party_size_allowed from guests where party_size_allowed >= 2 limit 1`;
const before = g.companions;
for (const c of ["mi esposa Ana","se llama Luis Gómez","AUN NO SE","todavía no lo he invitado","Ana Lopez","mi esposa","nadie"]) {
  const r = await recordCompanionName(g.id, c);
  console.log(`${JSON.stringify(c).padEnd(30)} → ${r.ok ? "guarda " + JSON.stringify(r.name) : "no guarda (" + r.reason + ")"}`);
}
const [solo] = await sql`select id from guests where party_size_allowed < 2 limit 1`;
if (solo) console.log("invitado sin +1 →", JSON.stringify(await recordCompanionName(solo.id, "Ana")));
await sql`update guests set companions=${sql.json(before)} where id=${g.id}`;
console.log("fila restaurada:", JSON.stringify((await sql`select companions from guests where id=${g.id}`)[0].companions));
await sql.end();
