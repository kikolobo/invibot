import { TZDate } from "@date-fns/tz";
import type { events } from "@/db/schema/events";
import { eventMapsUrl, shortMapsLabel } from "./maps";
import { countryLabel } from "./places";

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
/**
 * The day alone, no time. For sentences that carry the date inside them, where
 * "el sábado 25 de octubre, 9:00 p.m." turns one clause into two.
 */
export function formatEventDate(event: Pick<EventRow, "startsAt" | "timezone">): string {
  // "sábado 24 de octubre", not "sábado, 24 de octubre". Intl puts the comma
  // there and it is right for a heading, but this string is read mid-sentence —
  // "el sábado, 24 de octubre. Mi nombre es:" stumbles where the plain form
  // does not. `formatEventWhen` keeps the comma: it stands on its own.
  return dateFmt.format(new TZDate(event.startsAt, event.timezone)).replace(/,\s+/, " ");
}

export function formatEventWhen(event: Pick<EventRow, "startsAt" | "timezone">): string {
  const local = new TZDate(event.startsAt, event.timezone);
  return `${dateFmt.format(local)}, ${timeFmt.format(local)}`;
}

export function formatEventWhere(
  event: Pick<EventRow, "venueName" | "venueCity">,
): string {
  return [event.venueName, event.venueCity].filter(Boolean).join(", ");
}

/**
 * The place as a guest reads it in a message.
 *
 * One line, because this is a template variable and Meta rejects a parameter
 * containing a newline — the body's own line breaks are fixed at approval
 * time. The venue and the street are separated by an em dash rather than a
 * comma so "Gomez Morin — Gomez Morin 901" still reads as two facts.
 *
 * The link is the short one. A raw Google URL is eighty characters of
 * percent-encoding in the middle of an invitation; `invibot.com/m/ab12cd`
 * redirects to the same pin and survives the venue being corrected later.
 */
export function formatEventWhereForMessage(
  event: Pick<
    EventRow,
    | "venueName"
    | "venueCity"
    | "venueAddress"
    | "venueState"
    | "venueCountry"
    | "venueMapsUrl"
    | "mapsCode"
  >,
): string {
  const head = [event.venueName?.trim(), event.venueAddress?.trim()]
    .filter(Boolean)
    .join(" — ");
  const place = [head, event.venueCity?.trim()].filter(Boolean).join(", ");

  const link = shortMapsLabel(event) ?? eventMapsUrl(event);
  if (!link) return place;
  return place ? `${place} · ${link}` : link;
}

/**
 * The address written out over as many lines as it needs, for the messages we
 * compose ourselves. Free-form sends have no newline restriction, so the venue
 * gets its own line and the street its own.
 */
export function formatEventAddressLines(
  event: Pick<
    EventRow,
    "venueName" | "venueAddress" | "venueCity" | "venueState" | "venueCountry"
  >,
): string[] {
  const street = [
    event.venueAddress?.trim(),
    event.venueCity?.trim(),
    event.venueState?.trim(),
  ]
    .filter(Boolean)
    .join(", ");

  const foreign = event.venueCountry && event.venueCountry !== "MX";
  const tail = foreign ? [street, countryLabel(event.venueCountry)].filter(Boolean).join(", ") : street;

  return [event.venueName?.trim(), tail].filter((line): line is string => Boolean(line));
}
