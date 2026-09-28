import { buildComponents, templates } from "@/lib/whatsapp/templates";
import type { TemplateComponent, WhatsAppConfig } from "@/lib/whatsapp/client";

/**
 * The `mensaje_organizador` template: its components, and whether Meta will
 * let it be sent at all.
 */

export const TEMPLATE = templates.mensaje_organizador;

/** The prefix every [Leer mensaje] tap carries, followed by the message id. */
export const READ_PAYLOAD = TEMPLATE.buttons[0].payload;

export function readPayloadFor(broadcastId: string): string {
  return `${READ_PAYLOAD}:${broadcastId}`;
}

/** The message a tap belongs to, or null when the payload is not one of ours. */
export function broadcastIdFromPayload(payload: string | null): string | null {
  if (!payload?.startsWith(`${READ_PAYLOAD}:`)) return null;
  const id = payload.slice(READ_PAYLOAD.length + 1);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/**
 * The template's parameters, with the button's payload naming this message.
 *
 * Meta rejects a parameter with a line break, a tab or more than four spaces
 * in a row, and names typed into a spreadsheet carry all three.
 */
export function templateComponents(
  broadcastId: string,
  values: { name: string; eventName: string; title: string },
): TemplateComponent[] {
  const clean = (text: string) => text.replace(/\s+/g, " ").trim();
  return buildComponents("mensaje_organizador", [
    clean(values.name),
    clean(values.eventName),
    clean(values.title),
  ]).map((component) =>
    component.type === "button"
      ? { ...component, parameters: [{ type: "payload", payload: readPayloadFor(broadcastId) }] }
      : component,
  );
}

type Status = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | "MISSING" | "UNKNOWN";

const cache = new Map<string, { status: Status; at: number }>();
const CACHE_MS = 5 * 60 * 1000;

/**
 * Whether Meta approved the template on this number's WABA.
 *
 * Asked rather than assumed, because the difference decides who gets the
 * message: while it is in review, only people with an open window can be
 * reached, and the rest wait. "UNKNOWN" — Meta did not answer — is treated as
 * approved by callers: a send that then fails is recorded as failed, which is
 * better than holding everyone back on a network blip.
 */
export async function templateStatus(config: WhatsAppConfig): Promise<Status> {
  if (!config.wabaId) return "UNKNOWN";

  const hit = cache.get(config.wabaId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.status;

  try {
    const url = new URL(`https://graph.facebook.com/v21.0/${config.wabaId}/message_templates`);
    url.searchParams.set("name", TEMPLATE.name);
    url.searchParams.set("fields", "name,language,status");
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${config.accessToken}` },
    });
    const json = (await response.json()) as {
      data?: { name: string; language: string; status: Status }[];
    };
    if (!response.ok || !json.data) return "UNKNOWN";

    const row = json.data.find((t) => t.name === TEMPLATE.name && t.language === TEMPLATE.language);
    const status = row?.status ?? "MISSING";
    cache.set(config.wabaId, { status, at: Date.now() });
    return status;
  } catch (error) {
    console.error("[mensajes] could not read the template status", error);
    return "UNKNOWN";
  }
}

export async function templateUsable(config: WhatsAppConfig): Promise<boolean> {
  const status = await templateStatus(config);
  return status === "APPROVED" || status === "UNKNOWN";
}
