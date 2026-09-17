import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guests, suppressions } from "@/db/schema/guests";
import { events } from "@/db/schema/events";
import { formatEventWhen, formatEventWhere } from "@/lib/events/format";
import { templates } from "./templates";
import { recordGuestEvent } from "@/lib/guests/history";
import { confirmationReply, declineReply } from "./replies";
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

export type GuestIntent =
  | "rsvp_yes"
  | "rsvp_yes_solo"
  | "rsvp_yes_plus_one"
  | "rsvp_no"
  | "question"
  | "opt_out"
  | "unknown";

/** Every way a guest can say yes. Three buttons, one meaning, different seat counts. */
export function isConfirmation(intent: GuestIntent): boolean {
  return intent === "rsvp_yes" || intent === "rsvp_yes_solo" || intent === "rsvp_yes_plus_one";
}

/**
 * Seats a confirmation implies, or null when the template carried no party
 * information and we should not overwrite what the organizer set.
 */
const SEATS: Partial<Record<GuestIntent, number>> = {
  rsvp_yes_solo: 1,
  rsvp_yes_plus_one: 2,
};

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
  [templates.invitacion_evento_acompanante.buttons[0].payload]: "rsvp_yes_solo",
  [templates.invitacion_evento_acompanante.buttons[1].payload]: "rsvp_yes_plus_one",
  // buttons[2] is RSVP_NO, already mapped above — one decline means one thing.
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
  [...templates.invitacion_evento.buttons, ...templates.invitacion_evento_acompanante.buttons]
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
  if (isConfirmation(intent) || intent === "rsvp_no") {
    // Clamped to what the organizer actually offered: a guest who taps the
    // plus-one button on a seat meant for one does not get to bring someone.
    const seats = SEATS[intent];
    const confirmed = seats === undefined ? {} : {
      partySizeConfirmed: Math.min(seats, guest.partySizeAllowed),
    };

    await db
      .update(guests)
      .set({
        rsvpStatus: isConfirmation(intent) ? "confirmed" : "declined",
        rsvpRespondedAt: at,
        ...confirmed,
        updatedAt: new Date(),
      })
      .where(eq(guests.id, guest.id));

    // Logged with the guest's own timestamp, not now(): this is the record of
    // when they decided, and someone who confirms, cancels and comes back
    // leaves three rows rather than overwriting one.
    await recordGuestEvent({
      eventId: guest.eventId,
      guestId: guest.id,
      type: isConfirmation(intent) ? "confirmed" : "declined",
      at,
      source: "guest",
      detail: seats === undefined ? {} : { seats },
    });
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

    await recordGuestEvent({
      eventId: guest.eventId,
      guestId: guest.id,
      type: "opted_out",
      at,
      source: "guest",
    });
  }
}

/**
 * What to say back, or null to stay quiet.
 *
 * An opt-out gets no reply on purpose: the guest asked us to stop, and a
 * courtesy receipt is still a message they did not ask for.
 */
export async function replyFor(guest: GuestRow, intent: GuestIntent): Promise<string | null> {
  if (!isConfirmation(intent) && intent !== "rsvp_no") return null;

  const event = await db.query.events.findFirst({ where: eq(events.id, guest.eventId) });
  if (!event) return null;

  const facts = {
    name: guest.firstName ?? guest.fullName,
    eventName: event.name,
    when: formatEventWhen(event),
    where: formatEventWhere(event),
  };

  if (intent === "rsvp_no") return declineReply(facts);
  return confirmationReply(facts, intent === "rsvp_yes_plus_one");
}
