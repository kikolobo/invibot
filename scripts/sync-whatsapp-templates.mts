/**
 * Submits every template in `lib/whatsapp/templates.ts` that Meta does not
 * already have.
 *
 * Approval is manual and takes anywhere from minutes to days, so this is safe
 * to re-run: existing names are reported and skipped, never resubmitted.
 *
 * To change the copy of a template Meta already has, use
 * `update-whatsapp-templates.mts` — an approved template can be edited in
 * place, once a day. Submitting a new name is only for a new message.
 *
 *   npx tsx scripts/sync-whatsapp-templates.mts [--profile production] [--dry-run]
 */
import { templates, toMetaPayload, type TemplateDefinition } from "@/lib/whatsapp/templates";
import { wabaFromArgv } from "./whatsapp-profile.mjs";

const GRAPH = "https://graph.facebook.com/v21.0";

const { wabaId, token } = wabaFromArgv();

const dryRun = process.argv.includes("--dry-run");

const existing = new Map<string, string>();
const listed = await fetch(`${GRAPH}/${wabaId}/message_templates?fields=name,language,status&limit=100`, {
  headers: { authorization: `Bearer ${token}` },
}).then((r) => r.json());

if (listed.error) throw new Error(`Could not list templates: ${listed.error.message}`);
for (const t of listed.data ?? []) existing.set(`${t.name}:${t.language}`, t.status);

for (const definition of Object.values(templates) as TemplateDefinition[]) {
  const key = `${definition.name}:${definition.language}`;
  const status = existing.get(key);

  if (status) {
    console.log(`  skip    ${definition.name.padEnd(22)} already on Meta (${status})`);
    continue;
  }

  const payload = toMetaPayload(definition);

  if (dryRun) {
    console.log(`  would   ${definition.name.padEnd(22)} ${definition.category}`);
    console.log(JSON.stringify(payload, null, 2));
    continue;
  }

  const result = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());

  if (result.error) {
    // Meta's detail is where the real reason lives; the top-level message is generic.
    const detail = result.error.error_user_msg ?? result.error.error_data?.details ?? "";
    console.log(`  FAILED  ${definition.name.padEnd(22)} ${result.error.message} ${detail}`);
    continue;
  }

  console.log(`  created ${definition.name.padEnd(22)} ${result.status ?? "PENDING"}  id=${result.id}`);
}

process.exit(0);
