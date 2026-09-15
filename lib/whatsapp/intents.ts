import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guests, suppressions } from "@/db/schema/guests";
import { events } from "@/db/schema/events";
import { formatEventWhen, formatEventWhere } from "@/lib/events/format";
import { templates } from "./templates";
import type { InboundMessage } from "./webhook";

/**
 * What a guest meant, and what we do about it.
 *
 * Deliberately narrow: this understands taps on our own buttons and one
 * keyword. Anything a guest actually types in words is a question for the
 * assistant, not something to guess at here — a regex that thinks it
 * understands Spanish will mark someone as declined for writing "no sé si
 * pueda".
 */

export type GuestIntent = "rsvp_yes" | "rsvp_no" | "question" | "opt_out" | "unknown";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .toUpperCase();

const PAYLOADS: Record<string, GuestIntent> = {
  [templates.invitacion_evento.buttons[0].payload]: "rsvp_yes",
  [templates.invitacion_evento.buttons[1].payload]: "rsvp_no",
  [templates.invitacion_evento.buttons[2].payload]: "question",
};

/**
 * The same buttons, matched as typed words.
 *
 * Plenty of guests reply by typing instead of hunting for a quick reply — the
 * buttons render faintly on some phones, and a reply is the more natural
 * gesture in a chat. Someone who types the exact words printed on the button
 * meant the button, and answering them with silence is worse than any risk of
 * reading them wrong.
 *
 * Derived from the button list rather than written out, so relabelling a button
 * cannot leave a stale phrase matching here.
 */
const LABELS: Record<string, GuestIntent> = Object.fromEntries(
  templates.invitacion_evento.buttons
    .filter((button) => PAYLOADS[button.payload])
    .map((button) => [normalize(button.label), PAYLOADS[button.payload]]),
);

/**
 * The opt-out keyword promised in every marketing footer. Matched against the
 * whole message, never as a substring: "ya me di de baja del gimnasio" is not
 * an opt-out, and silently dropping that guest would be worse than missing it.
 */
const OPT_OUT_WORDS = new Set(["BAJA", "STOP", "CANCELAR"]);

export function parseIntent(message: InboundMessage): GuestIntent {
  // The payload is ours and survives a relabelled button; the visible text does
  // not. Always prefer it.
  if (message.buttonPayload && PAYLOADS[message.buttonPayload]) {
    return PAYLOADS[message.buttonPayload];
  }
  if (!message.text) return "unknown";

  const text = normalize(message.text);
  if (OPT_OUT_WORDS.has(text)) return "opt_out";

  // Only ever the whole message. "Sí, asistiré pero llego tarde" is a person
  // telling us something a template cannot answer, and it stays a question for
  // the assistant rather than becoming a silent confirmation.
  if (LABELS[text]) return LABELS[text];

  return "unknown";
}

type GuestRow = typeof guests.$inferSelect;

/**
 * Records what the intent means about this guest. Runs inside the webhook
 * request rather than after it: these are facts, and if the write is lost
 * Meta's redelivery is the only thing that would bring them back.
 */
export async function applyIntent(
  guest: GuestRow,
  intent: GuestIntent,
  at: Date,
): Promise<void> {
  if (intent === "rsvp_yes" || intent === "rsvp_no") {
    await db
      .update(guests)
      .set({
        rsvpStatus: intent === "rsvp_yes" ? "confirmed" : "declined",
        rsvpRespondedAt: at,
        updatedAt: new Date(),
      })
      .where(eq(guests.id, guest.id));
    return;
  }

  if (intent === "opt_out") {
    // Global and cross-event: a person who says BAJA once is never messaged
    // again by any organizer on the platform.
    if (guest.phoneE164) {
      await db
        .insert(suppressions)
        .values({ phoneE164: guest.phoneE164, reason: "opt_out", sourceEventId: guest.eventId })
        .onConflictDoNothing({ target: suppressions.phoneE164 });
    }
    await db
      .update(guests)
      .set({ optedOut: true, optedOutAt: at, updatedAt: new Date() })
      .where(eq(guests.id, guest.id));
  }
}

/**
 * What to say back, or null to stay quiet.
 *
 * An opt-out gets no reply on purpose: the guest asked us to stop, and a
 * courtesy receipt is still a message they did not ask for.
 */
export async function replyFor(guest: GuestRow, intent: GuestIntent): Promise<string | null> {
  if (intent !== "rsvp_yes" && intent !== "rsvp_no") return null;

  const event = await db.query.events.findFirst({ where: eq(events.id, guest.eventId) });
  if (!event) return null;

  const name = guest.firstName ?? guest.fullName;

  if (intent === "rsvp_no") {
    return `Gracias por avisar, ${name}. Te vamos a extrañar en ${event.name} 💛\n\nSi tus planes cambian, escríbeme por aquí.`;
  }

  // Mirrors the confirmacion_rsvp template, which is what goes out instead when
  // the service window has closed.
  return [
    `Listo ${name} ✅`,
    "",
    `Tu lugar está confirmado para ${event.name}.`,
    "",
    `📅 ${formatEventWhen(event)}`,
    `📍 ${formatEventWhere(event)}`,
    "",
    "Si algo cambia, avísame por este medio.",
  ].join("\n");
}
