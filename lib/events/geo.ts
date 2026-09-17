import { venueQuery } from "./maps";
import type { events } from "@/db/schema/events";

/**
 * Turning an address into a pin.
 *
 * Needed only for the native WhatsApp location — a map card with a real dot on
 * it, which takes latitude and longitude and will not accept a street name.
 * Everything else about the venue travels as text or as a link.
 *
 * Two sources, cheapest first. A Google Maps link the organizer pasted usually
 * carries the coordinates in its path, which is free and exact. Failing that we
 * geocode the written address. Both are best-effort: no coordinates means the
 * assistant sends the link instead, which is what it did before this existed.
 */

type EventRow = typeof events.$inferSelect;

export type Coords = { lat: number; lng: number };

const inRange = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Coordinates out of a Google Maps URL.
 *
 * Google writes them several ways and none of them are documented as stable:
 * `@lat,lng,17z` is the map's centre, `!3dlat!4dlng` is the pinned place (more
 * precise — the centre can be offset by the side panel), and `?q=lat,lng` is
 * what a "copy coordinates" paste produces. The place marker wins where both
 * appear.
 */
export function coordsFromMapsUrl(url: string): Coords | null {
  const patterns = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|center|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (inRange(lat, lng)) return { lat, lng };
  }
  return null;
}

/**
 * The same, for a link that has to be opened first.
 *
 * `maps.app.goo.gl/xxxx` is what the Share button produces and it carries
 * nothing but an id — the coordinates only appear in what it redirects to.
 */
export async function coordsFromShortLink(url: string): Promise<Coords | null> {
  const direct = coordsFromMapsUrl(url);
  if (direct) return direct;

  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        // Google serves a consent interstitial without a browser-shaped agent,
        // and the interstitial has no coordinates in it.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(6000),
    });
    const fromUrl = coordsFromMapsUrl(response.url);
    if (fromUrl) return fromUrl;

    // Some share links land on a page whose URL is still opaque; the place's
    // coordinates are in the body, in the same `!3d!4d` shape.
    const body = await response.text();
    return coordsFromMapsUrl(body);
  } catch {
    return null;
  }
}

/**
 * Google's own answer for an address, without an API key.
 *
 * The embed page Google serves for `?q=<address>&output=embed` carries the
 * resolved place as a `[lat,lng]` pair in its body — the same geocoder behind
 * the Maps link we hand guests, which is precise where Nominatim is not: for
 * one San Pedro address the two disagree by 818 metres, which is the
 * difference between a driveway and the wrong block.
 *
 * Undocumented and therefore not to be relied on alone: in testing it answered
 * for some addresses and returned a stub for others, so every caller falls
 * through to Nominatim. Set GOOGLE_MAPS_API_KEY and none of this runs — the
 * real Geocoding API answers every time.
 */
export async function coordsFromGoogleSearch(query: string): Promise<Coords | null> {
  try {
    const url = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
        "accept-language": "es-MX,es;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.text();

    // The pair is the whole signal. When Google resolves the address it writes
    // the place as `[lat,lng]`; when it cannot, the response carries only a
    // camera centroid — 9 km off for one CDMX address I checked — and no pair
    // at all. So its absence means "Google is not sure", which is exactly the
    // case where guessing is worse than falling through. (Do not gate on body
    // size: the confident answers are the *small* responses, around 2.4 KB.)
    const match = body.match(/\[(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/);
    if (!match) return null;

    const lat = Number(match[1]);
    const lng = Number(match[2]);
    return inRange(lat, lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/**
 * Geocodes a written address through OpenStreetMap's Nominatim.
 *
 * Chosen because it needs no API key and no billing account — this runs once
 * when an organizer saves an event, which is nowhere near Nominatim's limits.
 * Their policy requires an identifying user agent, hence the header. If a
 * Google key ever lands in the environment, prefer it: Google is markedly
 * better on Mexican addresses, which is the only geography that matters here.
 */
export async function geocodeAddress(query: string): Promise<Coords | null> {
  const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

  try {
    if (googleKey) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${googleKey}`;
      const data = await fetch(url, { signal: AbortSignal.timeout(6000) }).then((r) => r.json());
      const spot = data?.results?.[0]?.geometry?.location;
      if (spot && inRange(spot.lat, spot.lng)) return { lat: spot.lat, lng: spot.lng };
      return null;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const data = await fetch(url, {
      headers: { "user-agent": "Invibot/1.0 (https://invibot.com)" },
      signal: AbortSignal.timeout(6000),
    }).then((r) => r.json());

    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    return inRange(lat, lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/**
 * The same address with the colonia dropped.
 *
 * Google resolves "Avenida Manuel Gomez Morin 901, San Pedro, Garza Garcia,
 * Nuevo León, México" to the door and refuses the identical string with
 * "Colonia Carrizalejo" in the middle — the neighbourhood is how a Mexican
 * writes an address and a nuisance to a geocoder that indexes streets. Tried
 * only as a second attempt, never in place of what the organizer wrote.
 */
function withoutColonia(query: string): string | null {
  const kept = query
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !/^col(onia)?\b\.?/i.test(part));

  const simplified = kept.join(", ");
  return simplified && simplified !== query ? simplified : null;
}

/**
 * The event's pin, resolved from whatever the organizer gave us.
 *
 * Returns null rather than guessing. A location message with the wrong dot on
 * it is worse than no location message: someone drives to it.
 */
export async function resolveCoords(
  event: Pick<
    EventRow,
    | "venueName"
    | "venueAddress"
    | "venueCity"
    | "venueState"
    | "venueCountry"
    | "venueMapsUrl"
  >,
): Promise<Coords | null> {
  const pinned = event.venueMapsUrl?.trim();
  if (pinned) {
    const fromLink = await coordsFromShortLink(pinned);
    if (fromLink) return fromLink;
  }

  const query = venueQuery(event);
  if (!query) return null;

  const simplified = withoutColonia(query);

  // Google first, and twice: it is the geocoder the guest's own maps app
  // agrees with, and the one whose link the organizer has already checked
  // against reality. Nominatim is the backstop — for one San Pedro address the
  // two disagree by 818 metres, and Google is the one that is right.
  for (const attempt of [query, simplified]) {
    if (!attempt) continue;
    const coords = await coordsFromGoogleSearch(attempt);
    if (coords) return coords;
  }

  for (const attempt of [query, simplified]) {
    if (!attempt) continue;
    const coords = await geocodeAddress(attempt);
    if (coords) return coords;
  }

  return null;
}
