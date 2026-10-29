import { templates, toMetaPayload, type TemplateDefinition } from "@/lib/whatsapp/templates";
import { whatsappConfig, type WhatsAppProfile } from "@/lib/whatsapp/client";

const GRAPH = "https://graph.facebook.com/v21.0";

export type SubmitOutcome = { name: string; ok: boolean; detail: string };

/** Templates in the code that this number's account does not have yet. */
export function missingTemplates(onMeta: string[]): TemplateDefinition[] {
  const have = new Set(onMeta);
  return (Object.values(templates) as TemplateDefinition[]).filter((t) => !have.has(t.name));
}

/**
 * Submits to Meta every template the code has and this number's account does
 * not — the same thing `scripts/sync-whatsapp-templates.mts` does, from the
 * server, where the production credentials live. Never resubmits a name Meta
 * already holds; an image-header template is skipped, since it needs its
 * sample image uploaded first and the script handles that.
 */
export async function submitMissingTemplates(profile: WhatsAppProfile): Promise<SubmitOutcome[] | { error: string }> {
  const config = whatsappConfig(profile);
  if (!config?.wabaId) return { error: "Este número no tiene WABA configurado." };

  const listed = await fetch(`${GRAPH}/${config.wabaId}/message_templates?fields=name,language&limit=100`, {
    headers: { authorization: `Bearer ${config.accessToken}` },
    cache: "no-store",
  }).then((r) => r.json());
  if (listed.error) return { error: `Meta: ${listed.error.message}` };

  const onMeta = (listed.data ?? []).map((t: { name: string }) => t.name);
  const outcomes: SubmitOutcome[] = [];
  for (const definition of missingTemplates(onMeta)) {
    if (definition.header?.format === "IMAGE") {
      outcomes.push({ name: definition.name, ok: false, detail: "lleva imagen: súbela con el script" });
      continue;
    }
    const result = await fetch(`${GRAPH}/${config.wabaId}/message_templates`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(toMetaPayload(definition)),
    }).then((r) => r.json());
    outcomes.push(
      result.error
        ? {
            name: definition.name,
            ok: false,
            detail: `${result.error.message} ${result.error.error_user_msg ?? ""}`.trim(),
          }
        : { name: definition.name, ok: true, detail: result.status ?? "PENDING" },
    );
  }
  return outcomes;
}
