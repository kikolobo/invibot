import { TZDate } from "@date-fns/tz";
import type { events } from "@/db/schema/events";

/**
 * How an event's date and place read to a guest.
 *
 * Shared rather than inlined because the same two strings appear in the
 * organizer UI, in template variables, and in whatever the assistant writes —
 * and a guest who sees one date on the microsite and another in WhatsApp will
 * believe neither.
 */

type EventRow = typeof events.$inferSelect;

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeFmt = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" });

/**
 * Always rendered in the event's own timezone: `startsAt` is an absolute
 * instant, and "7 PM" means seven in the evening where the party is, not where
 * the server happens to run.
 */
export function formatEventWhen(event: Pick<EventRow, "startsAt" | "timezone">): string {
  const local = new TZDate(event.startsAt, event.timezone);
  return `${dateFmt.format(local)}, ${timeFmt.format(local)}`;
}

export function formatEventWhere(
  event: Pick<EventRow, "venueName" | "venueCity">,
): string {
  return [event.venueName, event.venueCity].filter(Boolean).join(", ");
}
