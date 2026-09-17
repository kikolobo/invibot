import type { events } from "@/db/schema";

type EventRow = typeof events.$inferSelect;

/**
 * What changed about an event, and whether a guest needs to hear about it.
 *
 * The distinction this file exists to make: some edits change what a guest
 * must do — a new date means a different evening, a new venue a different
 * drive — and some only change how the next invitation is written. Companion
 * rules and QR settings are the second kind: they apply to invitations not yet
 * sent, and people already holding one keep what they were given.
 */

export type EventChange = "date" | "venue" | "card" | "name" | "hosts" | "rsvp" | "companions" | "qr";

/** Changes a guest is told about. Everything else is the organizer's business. */
const GUEST_FACING: EventChange[] = ["date", "venue", "card"];

export type ChangeSet = {
  all: EventChange[];
  guestFacing: EventChange[];
  /** The sentence a guest reads — "Cambió la fecha". Null when nothing concerns them. */
  summary: string | null;
};

/** The noun each change is about, for building one sentence out of several. */
const nouns: Record<string, string> = {
  date: "la fecha",
  venue: "el lugar",
  card: "la invitación",
};

/** Joins in Spanish: "a", "a y b", "a, b y c". */
function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/**
 * One sentence, conjugated to match.
 *
 * Built from nouns rather than by joining finished sentences, which produced
 * "Cambió la fecha y cambió el lugar" — which reads as two announcements stapled
 * together rather than one piece of news.
 */
function summarise(changes: string[]): string {
  const parts = changes.map((change) => nouns[change]).filter(Boolean);
  if (parts.length === 0) return "";
  const verb = parts.length === 1 ? "Cambió" : "Cambiaron";
  return `${verb} ${joinEs(parts)}`;
}

const sameVenue = (a: EventRow, b: EventRow) =>
  a.venueName === b.venueName &&
  a.venueAddress === b.venueAddress &&
  a.venueCity === b.venueCity &&
  a.venueState === b.venueState &&
  a.venueCountry === b.venueCountry &&
  a.venueMapsUrl === b.venueMapsUrl;

export function diffEvent(before: EventRow, after: EventRow): ChangeSet {
  const all: EventChange[] = [];

  if (before.startsAt.getTime() !== after.startsAt.getTime()) all.push("date");
  if (!sameVenue(before, after)) all.push("venue");
  // The card is compared by key: a replacement always gets a new one.
  if (before.cardR2Key !== after.cardR2Key) all.push("card");
  if (before.name !== after.name) all.push("name");
  if (before.hostNames !== after.hostNames) all.push("hosts");
  if (before.rsvpRequired !== after.rsvpRequired) all.push("rsvp");
  if (before.maxPartySize !== after.maxPartySize) all.push("companions");
  if (before.qrEnabled !== after.qrEnabled) all.push("qr");

  const guestFacing = all.filter((change) => GUEST_FACING.includes(change));

  return {
    all,
    guestFacing,
    summary: guestFacing.length ? summarise(guestFacing) : null,
  };
}

/** How the change reads to an organizer deciding whether to send anything. */
export const changeLabels: Record<EventChange, string> = {
  date: "la fecha",
  venue: "el lugar",
  card: "la imagen de la invitación",
  name: "el nombre del evento",
  hosts: "quién invita",
  rsvp: "si se pide confirmación",
  companions: "la regla de acompañantes",
  qr: "el código de acceso",
};
