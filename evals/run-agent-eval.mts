/**
 * Scores the assistant against `agent-cases.ts`.
 *
 *   npx tsx evals/run-agent-eval.mts [--case "substring"]
 *
 * Run it before and after any change to the prompt in `lib/agent/context.ts`.
 * The negatives are the point: an edit that improves one answer can quietly
 * teach it to mark a hesitant guest as declined, and only a re-run shows that.
 *
 * Costs real money — one API call per turn, so roughly a dozen small requests.
 */
process.loadEnvFile(".env.local");

const { db } = await import("../db/index");
const { events } = await import("../db/schema/events");
const { guests } = await import("../db/schema/guests");
const { eq } = await import("drizzle-orm");
const { buildContext } = await import("../lib/agent/context");
const { anthropicFromEnv, runAgentTurn } = await import("../lib/agent/run");
const { cases } = await import("./agent-cases");
type Msg = { role: "user" | "assistant"; content: string };

const filter = process.argv.includes("--case")
  ? process.argv[process.argv.indexOf("--case") + 1]?.toLowerCase()
  : null;

const [event] = await db.select().from(events).limit(1);
const [guest] = await db.select().from(guests).where(eq(guests.eventId, event.id)).limit(1);
if (!event || !guest) throw new Error("need an event with at least one guest");

const client = anthropicFromEnv();
if (!client) throw new Error("ANTHROPIC_API_KEY is not set");

// One context per (seats, pin) combination, so a case can state the world it
// needs instead of inheriting whatever the seeded rows happen to say today —
// the seeded guest's seats follow the event's +1 setting, and the coordinates
// depend on whether anyone has saved an address since.
const contexts = new Map<string, { systemPrompt: string; tools: unknown[] }>();
for (const seats of [1, 2]) {
  for (const pin of [false, true]) {
    const context = await buildContext(
      { ...event, venueLat: pin ? 25.6621 : null, venueLng: pin ? -100.3552 : null },
      { ...guest, partySizeAllowed: seats },
    );
    contexts.set(`${seats}:${pin}`, context);
  }
}
console.log(`event "${event.name}" · guest ${guest.fullName} (pases=${guest.partySizeAllowed})`);
console.log(`model ${process.env.ANTHROPIC_MODEL ?? "claude-opus-5"}\n`);

let passed = 0;
const failures: string[] = [];
const totals = { input: 0, output: 0, cacheRead: 0 };

for (const testCase of cases) {
  if (filter && !testCase.name.toLowerCase().includes(filter)) continue;

  const history: Msg[] = [];
  const actions: { tool: string; [k: string]: unknown }[] = [];
  let reply = "";
  let failed: string | null = null;

  for (const message of testCase.messages) {
    history.push({ role: "user", content: message });
    const seats = testCase.seats ?? (guest.partySizeAllowed >= 2 ? 2 : 1);
    const pin = testCase.pin ?? Boolean(event.venueLat && event.venueLng);
    const context = contexts.get(`${seats}:${pin}`)!;
    const result = await runAgentTurn(
      client,
      context.systemPrompt,
      history,
      async (action) => {
        actions.push(action as { tool: string });
        return "Registrado.";
      },
      context.tools as Parameters<typeof runAgentTurn>[4],
    );
    if ("error" in result) {
      failed = `request failed: ${result.error}`;
      break;
    }
    reply = result.reply;
    history.push({ role: "assistant", content: reply || "(sin texto)" });
    totals.input += result.usage.input;
    totals.output += result.usage.output;
    totals.cacheRead += result.usage.cacheRead;
  }

  const tools = actions.map((a) => a.tool);
  const lower = reply.toLowerCase();
  if (!failed) {
    // Argument-level assertions: the companion case turns on *how* a tool was
    // called, not whether it was.
    for (const forbidden of testCase.forbidActions ?? []) {
      const hit = actions.find(
        (a) =>
          a.tool === forbidden.tool &&
          Object.entries(forbidden.where ?? {}).every(([k, v]) => a[k] === v),
      );
      if (hit) failed ??= `must not call ${forbidden.tool} with ${JSON.stringify(forbidden.where)}`;
    }
    for (const tool of testCase.expectTools ?? []) {
      if (!tools.includes(tool)) failed ??= `expected ${tool}, got [${tools.join(", ") || "none"}]`;
    }
    for (const tool of testCase.forbidTools ?? []) {
      if (tools.includes(tool)) failed ??= `must not call ${tool}`;
    }
    for (const text of testCase.forbidText ?? []) {
      if (lower.includes(text)) failed ??= `reply must not contain "${text}"`;
    }
    if (testCase.expectText && !testCase.expectText.some((t) => lower.includes(t))) {
      failed ??= `reply should mention one of ${JSON.stringify(testCase.expectText)}`;
    }
  }

  if (failed) {
    failures.push(`${testCase.name}: ${failed}\n     why: ${testCase.because}`);
    console.log(`FAIL  ${testCase.name}\n      ${failed}`);
  } else {
    passed++;
    console.log(`pass  ${testCase.name}`);
  }
  console.log(`      reply: ${reply.replace(/\n/g, " ⏎ ").slice(0, 110)}`);
  console.log(`      tools: ${actions.map((a) => JSON.stringify(a)).join(" ") || "none"}\n`);
}

const run = cases.filter((c) => !filter || c.name.toLowerCase().includes(filter)).length;
console.log(`${passed}/${run} passed`);
console.log(`tokens in=${totals.input} out=${totals.output} cacheRead=${totals.cacheRead}`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
}
process.exit(failures.length === 0 ? 0 : 1);
