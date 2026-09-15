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

const PAYLOADS: Record<string, GuestIntent> = {
  [templates.invitacion_evento.buttons[0].payload]: "rsvp_yes",
  [templates.invitacion_evento.buttons[1].payload]: "rsvp_no",
  [templates.invitacion_evento.buttons[2].payload]: "question",
};

/**
 * The opt-out keyword promised in every marketing footer. Matched against the
 * whole message, never as a substring: "ya me di de baja del gimnasio" is not
 * an opt-out, and silently dropping that guest would be worse than missing it.
 */
const OPT_OUT_WORDS = new Set(["BAJA", "STOP", "CANCELAR"]);

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .toUpperCase();

export function parseIntent(message: InboundMessage): GuestIntent {
  // The payload is ours and survives a relabelled button; the visible text does
  // not. Always prefer it.
  if (message.buttonPayload && PAYLOADS[message.buttonPayload]) {
    return PAYLOADS[message.buttonPayload];
  }
  if (message.text && OPT_OUT_WORDS.has(normalize(message.text))) return "opt_out";
  return message.text ? "unknown" : "unknown";
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
