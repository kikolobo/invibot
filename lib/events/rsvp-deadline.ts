import type { events } from "@/db/schema";
import { assistantName } from "@/lib/agent/identity";
import { formatEventDate } from "./format";
import { wallClock, zonedToInstant } from "./zones";

type EventRow = typeof events.$inferSelect;

/**
 * The last day to confirm, optional. The organizer picks a day; it holds until
 * the end of that day where the party is, so "hasta el viernes" includes
 * Friday evening.
 *
 * Past it, a guest can no longer say yes — not by button, not to the
 * assistant. Saying no still counts: a guest who will not make it frees a
 * seat, and their pass has to stop working either way.
 */
export function deadlineFromDate(date: string, timezone: string): Date {
  return new Date(zonedToInstant(date, "23:59", timezone).getTime() + 59_000);
}

/** The day the organizer picked, as a date input wants it. */
export function deadlineDate(deadline: Date | null, timezone: string): string {
  return deadline ? wallClock(deadline, timezone).date : "";
}

/**
 * A deadline after the party is no deadline at all; one in the past is
 * allowed — closing confirmations today is a thing a host may want.
 */
export function deadlineError(
  date: string,
  event: Pick<EventRow, "startsAt" | "timezone">,
): string | null {
  if (!date) return null;
  return date > wallClock(event.startsAt, event.timezone).date
    ? "Tiene que ser antes del evento, o el mismo día."
    : null;
}

export function rsvpClosed(
  event: Pick<EventRow, "rsvpDeadline">,
  at: Date = new Date(),
): boolean {
  return event.rsvpDeadline !== null && at.getTime() > event.rsvpDeadline.getTime();
}

/** "viernes 20 de noviembre" */
export function formatDeadline(event: Pick<EventRow, "rsvpDeadline" | "timezone">): string | null {
  return event.rsvpDeadline
    ? formatEventDate({ startsAt: event.rsvpDeadline, timezone: event.timezone })
    : null;
}

/** What the assistant's confirm tool answers once confirmations are closed. */
export const RSVP_CLOSED_TOOL_RESULT = [
  "NO se registró: la fecha límite para confirmar ya pasó.",
  "Dile con tacto que las confirmaciones ya cerraron y que, si aún quiere ir,",
  "le escriba directamente a quien lo invitó. No le prometas un lugar.",
].join(" ");

/** What a guest hears when they try to confirm too late. */
export function rsvpClosedReply(event: Pick<EventRow, "rsvpDeadline" | "timezone" | "name">): string {
  return [
    `Las confirmaciones para *${event.name}* cerraron el ${formatDeadline(event)}, así que ya no puedo registrar tu asistencia.`,
    "Si aún quieres ir, escríbele directamente a quien te invitó.",
    "",
    `— ${assistantName()}`,
  ].join("\n");
}
