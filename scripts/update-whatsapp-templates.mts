/**
 * Brings templates Meta already has in line with `lib/whatsapp/templates.ts`.
 *
 * The sibling sync script only creates what is missing, on the belief that an
 * approved template is frozen. It is not: Meta allows editing a template in
 * APPROVED, REJECTED or PAUSED status — once a day, ten times a month — and the
 * edit goes back into review. A template in PENDING cannot be touched at all,
 * so a just-submitted one has to wait.
 *
 * Only the footer is sent. Body and buttons are what the approval was granted
 * for, and an edit that changes the variable count silently breaks every call
 * site that fills them.
 *
 *   npx tsx scripts/update-whatsapp-templates.mts [--profile production]   # shows the plan
 *   npx tsx scripts/update-whatsapp-templates.mts --apply    # sends it
 *   npx tsx scripts/update-whatsapp-templates.mts --apply --only recordatorio_evento
 */
import { templates, type TemplateDefinition } from "@/lib/whatsapp/templates";
import { wabaFromArgv } from "./whatsapp-profile.mjs";

const GRAPH = "https://graph.facebook.com/v21.0";

const { wabaId, token } = wabaFromArgv();

const apply = process.argv.includes("--apply");
const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;

type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  components: { type: string; text?: string }[];
};

const listed = await fetch(
  `${GRAPH}/${wabaId}/message_templates?fields=name,language,status,components&limit=100`,
  { headers: { authorization: `Bearer ${token}` } },
).then((r) => r.json());
if (listed.error) throw new Error(`Could not list templates: ${listed.error.message}`);

const live = new Map<string, MetaTemplate>();
for (const t of listed.data ?? []) live.set(`${t.name}:${t.language}`, t);

for (const definition of Object.values(templates) as TemplateDefinition[]) {
  if (only && definition.name !== only) continue;

  const remote = live.get(`${definition.name}:${definition.language}`);
  const label = definition.name.padEnd(32);

  if (!remote) {
    console.log(`  absent  ${label} not on Meta — run sync-whatsapp-templates first`);
    continue;
  }

  const current = remote.components.find((c) => c.type === "FOOTER")?.text ?? null;
  const wanted = definition.footer ?? null;

  if (current === wanted) {
    console.log(`  same    ${label} footer already «${wanted ?? "none"}»`);
    continue;
  }
  if (remote.status === "PENDING") {
    console.log(`  waiting ${label} in review; Meta refuses edits until it lands`);
    continue;
  }
  if (!wanted) {
    console.log(`  skip    ${label} would remove the footer; not doing that silently`);
    continue;
  }

  console.log(`  edit    ${label} «${current ?? "none"}» → «${wanted}» (${remote.status})`);
  if (!apply) continue;

  const result = await fetch(`${GRAPH}/${remote.id}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      components: [
        ...remote.components.filter((c) => c.type !== "FOOTER"),
        { type: "FOOTER", text: wanted },
      ],
    }),
  }).then((r) => r.json());

  if (result.error) {
    const detail = result.error.error_user_msg ?? result.error.error_data?.details ?? "";
    console.log(`          FAILED ${result.error.message} ${detail}`);
    continue;
  }
  console.log(`          sent for review`);
}

process.exit(0);
