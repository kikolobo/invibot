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

/**
 * Formatters bound to a timezone, built once per zone.
 *
 * The `timeZone` option is the whole point and its absence was a real bug:
 * `Intl.DateTimeFormat` without it formats in the *runtime's* zone. `TZDate`
 * overrides `getHours()` and its siblings, but `Intl.format()` reads the epoch
 * underneath and ignores all of that — so a date was correct on a laptop in
 * Monterrey and a day late on Vercel, which runs in UTC. Guests were told
 * "domingo 11 de octubre, 1:00 a.m." about a party at 7 on Saturday the 10th.
 *
 * Memoised because constructing an `Intl.DateTimeFormat` is not cheap and every
 * invitation in a campaign formats the same event.
 */
const dateFmts = new Map<string, Intl.DateTimeFormat>();
const timeFmts = new Map<string, Intl.DateTimeFormat>();

/** Falls back loudly rather than throwing: a bad zone must not kill a send. */
function zoneOf(timezone: string): string {
  try {
    new Intl.DateTimeFormat("es-MX", { timeZone: timezone });
    return timezone;
  } catch {
    console.error("[format] unusable timezone, falling back", timezone);
    return "America/Mexico_City";
  }
}

function dateFmtFor(timezone: string): Intl.DateTimeFormat {
  const zone = zoneOf(timezone);
  let fmt = dateFmts.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: zone,
    });
    dateFmts.set(zone, fmt);
  }
  return fmt;
}

function timeFmtFor(timezone: string): Intl.DateTimeFormat {
  const zone = zoneOf(timezone);
  let fmt = timeFmts.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("es-MX", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
    });
    timeFmts.set(zone, fmt);
  }
  return fmt;
}

/**
 * The day alone, no time. For sentences that carry the date inside them, where
 * "el sábado 25 de octubre, 9:00 p.m." turns one clause into two.
 */
export function formatEventDate(event: Pick<EventRow, "startsAt" | "timezone">): string {
  // "sábado 24 de octubre", not "sábado, 24 de octubre". Intl puts the comma
  // there and it is right for a heading, but this string is read mid-sentence.
  return dateFmtFor(event.timezone).format(event.startsAt).replace(/,\s+/, " ");
}

/**
 * Always rendered in the event's own timezone: `startsAt` is an absolute
 * instant, and "7 PM" means seven in the evening where the party is, not where
 * the server happens to run.
 */
export function formatEventWhen(event: Pick<EventRow, "startsAt" | "timezone">): string {
  return `${dateFmtFor(event.timezone).format(event.startsAt)}, ${timeFmtFor(event.timezone).format(event.startsAt)}`;
}

/**
 * The time alone, for a message that has already said which day — "¡Es
 * mañana!" followed by a full date reads like the sender forgot.
 */
export function formatEventTime(event: Pick<EventRow, "startsAt" | "timezone">): string {
  return timeFmtFor(event.timezone).format(event.startsAt);
}

/**
 * The event's calendar day where the party is, as `YYYY-MM-DD`, offset by
 * `plusDays`. What "mañana" means has to be decided in the event's zone: at
 * 7 PM in Monterrey it is already tomorrow in UTC.
 */
export function localDayKey(at: Date, timezone: string, plusDays = 0): string {
  const shifted = new Date(at.getTime() + plusDays * 24 * 60 * 60 * 1000);
  // en-CA formats as YYYY-MM-DD, which compares as a string.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: zoneOf(timezone),
  }).format(shifted);
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
