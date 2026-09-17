/**
 * What Meta thinks of our templates right now.
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-template-status.mts [--profile production]
 *
 * A template in PENDING cannot be sent — invitations and change notices fail
 * until it is APPROVED again. Free-form replies inside the 24-hour window are
 * unaffected, which is why a guest mid-conversation still gets answers.
 */
import { wabaFromArgv } from "./whatsapp-profile.mjs";

const { wabaId, token } = wabaFromArgv();

const result = await fetch(
  `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,status,category,components&limit=100`,
  { headers: { authorization: `Bearer ${token}` } },
).then((r) => r.json());
if (result.error) throw new Error(result.error.message);

const rows = (result.data ?? []).filter((t: { name: string }) => t.name !== "hello_world");
for (const t of rows) {
  const footer = t.components.find((c: { type: string }) => c.type === "FOOTER")?.text ?? "—";
  console.log(`${t.status.padEnd(10)} ${t.name.padEnd(35)} ${footer}`);
}

const pending = rows.filter((t: { status: string }) => t.status === "PENDING").length;
console.log(`\n${rows.length - pending}/${rows.length} sendable${pending ? ` · ${pending} in review` : ""}`);
process.exit(0);
