import { customAlphabet } from "nanoid";
import type { events } from "@/db/schema/events";
import { countryLabel } from "./places";

/**
 * Getting to the party.
 *
 * Two different things share this file. The **embed** is always built from the
 * written address: Google's keyless embed takes a search query, and a shortened
 * share link (`maps.app.goo.gl/…`) is not one — it renders an error frame. The
 * **link we send guests** prefers whatever the organizer pasted, because a
 * pinned share link points at the door and a text search points at the street.
 *
 * Both are `null` when there is nothing to search for. A "Cómo llegar" that
 * opens a map of nowhere is worse than no link at all.
 */

type EventRow = typeof events.$inferSelect;
type VenueFields = Pick<
  EventRow,
  "venueName" | "venueAddress" | "venueCity" | "venueState" | "venueCountry" | "venueMapsUrl"
>;
type ShortFields = VenueFields & Pick<EventRow, "mapsCode">;

/**
 * Where a guest-facing link points: the live site, always.
 *
 * Emphatically *not* BETTER_AUTH_URL, which is "http://localhost:3000" on a
 * developer's machine — a real guest was sent
 * "localhost:3000/m/fffb47b6" because a change notice went out from a local
 * run. Nor the preview hostname Vercel mints per deployment: an invitation is
 * read weeks later, long after that host is gone. The link resolves against
 * production because that is the only place it can work.
 */
const PUBLIC_SITE = "https://invibot.com";

function publicBase(): string {
  const override = process.env.INVIBOT_PUBLIC_URL?.trim();
  return (override || PUBLIC_SITE).replace(/\/$/, "");
}

/**
 * The short link: `invibot.com/m/ab12cd`, redirecting to Google Maps.
 *
 * Shown without its scheme because it sits inside a WhatsApp message where
 * every character is visible, and WhatsApp linkifies a bare domain anyway. The
 * full Google URL — eighty characters of percent-encoding — stays for the
 * assistant to hand over when a guest actually asks for directions.
 */
export function shortMapsUrl(event: ShortFields): string | null {
  if (!event.mapsCode) return null;
  if (!eventMapsUrl(event)) return null;
  return `${publicBase()}/m/${event.mapsCode}`;
}

/** The same link with `https://` stripped, for message bodies. */
export function shortMapsLabel(event: ShortFields): string | null {
  return shortMapsUrl(event)?.replace(/^https?:\/\//, "") ?? null;
}

/**
 * The link we put in a message to a guest: short when the event has a code,
 * the Google URL when it does not. The assistant hands out the Google one
 * instead, because a guest asking "¿me pasas la ubicación?" wants something
 * their maps app opens without a redirect in between.
 */
export function guestMapsLink(event: ShortFields): string | null {
  return shortMapsLabel(event) ?? eventMapsUrl(event);
}

/** Six characters with no 0/O or 1/l in them, to survive being read aloud. */
export const newMapsCode = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 6);

/**
 * The address, and only the address.
 *
 * The venue name is deliberately excluded. "Hacienda San Pedro" is what the
 * party is called, not where it is: a geocoder handed both will happily match
 * the name against a business three states away and return a pin someone
 * drives to. The street, city, state and country are the parts that identify
 * a place on earth.
 *
 * So an event with no street address gets no map, no pin and no link — which
 * is the honest outcome. A search for a venue name is a guess wearing the
 * costume of an address.
 */
export function venueQuery(event: VenueFields): string | null {
  const street = event.venueAddress?.trim();
  if (!street) return null;

  return [street, event.venueCity?.trim(), event.venueState?.trim(), countryLabel(event.venueCountry)]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

/** Spaces as `+`: the same URL, a good deal shorter to read. */
const asQuery = (value: string) => encodeURIComponent(value).replace(/%20/g, "+");

/** The link a guest taps. The organizer's own pin wins when they set one. */
export function eventMapsUrl(event: VenueFields): string | null {
  const pinned = event.venueMapsUrl?.trim();
  if (pinned) return pinned;

  const query = venueQuery(event);
  if (!query) return null;
  return `https://maps.google.com/?q=${asQuery(query)}`;
}

/** The iframe source for the organizer's own page. Never the share link. */
export function eventMapsEmbedUrl(event: VenueFields): string | null {
  const query = venueQuery(event);
  if (!query) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}
