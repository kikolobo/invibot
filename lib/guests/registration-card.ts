import type { events } from "@/db/schema";
import { eventKindLabels } from "@/lib/events/kinds";
import { formatEventDate } from "@/lib/events/format";

type EventRow = typeof events.$inferSelect;

/**
 * The same words on the card and on the button.
 *
 * It says nothing about WhatsApp: this is read inside WhatsApp, by someone who
 * got here from a WhatsApp message, and the line is too short to spend on where
 * they already are.
 */
export const CALL_TO_ACTION = "Toca aquí para registrarte y confirmar";

/** "el cumpleaños de Ana" → "El cumpleaños de Ana". */
export const sentence = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * What the event is called in public.
 *
 * The kind, whose it is, and the date — and deliberately nothing else. This is
 * the same set of facts the prefilled message already carries, so the preview
 * discloses nothing new to whoever the link is forwarded to. The venue is not
 * here and must never be: that is what the private invitation card is for.
 */
export function describe(event: EventRow) {
  const kind = eventKindLabels[event.kind].esInline;
  const host = event.hostNames?.trim();
  return sentence(`${kind} ${host ? `de ${host}` : event.name.trim()}`);
}

/**
 * The link preview's title, as WhatsApp shows it in a chat. The date rides in
 * the title because the description is what WhatsApp truncates, and "when" is
 * the fact worth protecting.
 */
export const registrationCardTitle = (event: EventRow) => `${describe(event)} · ${formatEventDate(event)}`;

/**
 * Prefixed only on the card: "RSVP" tells someone scrolling a group chat what
 * this link is before they read the rest.
 */
export const REGISTRATION_CARD_DESCRIPTION = `RSVP: ${CALL_TO_ACTION}`;
