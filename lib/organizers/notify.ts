import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, organizers, sends } from "@/db/schema";
import { whatsappConfig, sendText, sendTemplate, type WhatsAppConfig } from "@/lib/whatsapp/client";
import { buildComponents } from "@/lib/whatsapp/templates";

type EventRow = typeof events.$inferSelect;
type OrganizerRow = typeof organizers.$inferSelect;

/**
 * Talking to an organizador.
 *
 * Its own path because `deliver()` is built around a guest: it checks an RSVP,
 * an opt-out and a 24-hour window belonging to somebody on a guest list. An
 * organizador has none of those and is not on one.
 *
 * What it keeps is the ledger. `sends.guest_id` is nullable, so every message
 * to an organizador is still a row with an event, a kind and an error if it
 * failed — a message that reached somebody and left no evidence is the thing
 * this project has spent the day avoiding.
 */

/** The one who receives guests' questions. Exactly one per event, by index. */
export async function responderFor(eventId: string): Promise<OrganizerRow | null> {
  const row = await db.query.organizers.findFirst({
    where: and(eq(organizers.eventId, eventId), eq(organizers.isResponder, true)),
  });
  return row ?? null;
}

/**
 * Whether we may write to this number in free form.
 *
 * The same 24-hour rule guests live under, and it applies to an organizador for
 * the same reason: Meta does not care what we call them. Their own reply opens
 * it, so a conversation already under way costs nothing and needs no template.
 */
function windowOpenFor(organizer: OrganizerRow): boolean {
  const last = organizer.lastInboundAt?.getTime();
  return Boolean(last && Date.now() - last < 24 * 60 * 60 * 1000);
}

/** Their message opened the window; remember when, so we can use it. */
export async function noteOrganizerInbound(organizerId: string, at: Date): Promise<void> {
  await db
    .update(organizers)
    .set({ lastInboundAt: at, updatedAt: new Date() })
    .where(eq(organizers.id, organizerId));
}

async function record(
  eventId: string,
  kind: "organizer_relay",
  templateName: string | null,
  result: { ok: true; messageId: string } | { ok: false; code: string; title: string },
): Promise<void> {
  await db.insert(sends).values({
    eventId,
    guestId: null,
    channel: "whatsapp",
    kind,
    templateName,
    templateLanguage: templateName ? "es_MX" : null,
    status: result.ok ? "sent" : "failed",
    providerMessageId: result.ok ? result.messageId : null,
    sentAt: result.ok ? new Date() : null,
    errorCode: result.ok ? null : result.code,
    errorTitle: result.ok ? null : result.title,
  });
}

/**
 * Puts a guest's question on the responder's phone.
 *
 * Free-form while their window is open, and the approved template otherwise —
 * `consulta_organizador`, which already says "respóndeme por aquí y le comparto
 * la respuesta" and has carried the question text since before anything sent
 * it.
 *
 * The event is named in the message because an organizador may run several and
 * a bare question says nothing about which party it belongs to. The staff code
 * rides with it so a reply that loses its WhatsApp context can still be placed.
 */
export async function askOrganizer(
  event: EventRow,
  organizer: OrganizerRow,
  question: string,
  config: WhatsAppConfig | null = whatsappConfig(),
): Promise<boolean> {
  if (!config) return false;

  const label = event.staffCode ? `${event.name} (${event.staffCode})` : event.name;
  const to = organizer.phoneE164;

  if (windowOpenFor(organizer)) {
    const body = `${label}\n\nAlguien preguntó:\n«${question}»\n\nRespóndeme por aquí y le comparto la respuesta.`;
    const result = await sendText(config, to, body);
    await record(event.id, "organizer_relay", null, result);
    return result.ok;
  }

  const result = await sendTemplate(
    config,
    to,
    "consulta_organizador",
    "es_MX",
    buildComponents("consulta_organizador", [
      organizer.fullName.split(/\s+/)[0],
      label,
      question,
    ]),
  );
  await record(event.id, "organizer_relay", "consulta_organizador", result);
  return result.ok;
}

/** A plain reply to an organizador who wrote to us — always inside the window. */
export async function replyToOrganizer(
  eventId: string,
  phoneE164: string,
  body: string,
  config: WhatsAppConfig | null = whatsappConfig(),
): Promise<boolean> {
  if (!config) return false;
  const result = await sendText(config, phoneE164, body);
  await record(eventId, "organizer_relay", null, result);
  return result.ok;
}
