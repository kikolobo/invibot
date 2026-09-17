import { customAlphabet } from "nanoid";
import type { events } from "@/db/schema/events";
import { publicBase } from "@/lib/public-url";
import { whatsappConfig, type WhatsAppConfig } from "@/lib/whatsapp/client";

/**
 * Auto-registro: the pure half.
 *
 * Codes, links, and reading an inbound message. Everything here is a function
 * of its arguments — no database, no network — because this is the part that
 * decides whether a stranger's message registers them at the right party, and
 * that deserves to be testable without a WABA.
 *
 * The conversation rules that use it live in `./registration.ts`.
 */

type EventRow = typeof events.$inferSelect;
type LinkFields = Pick<EventRow, "registrationCode" | "hostNames" | "name">;

/**
 * No i, l, o, 0 or 1: the code gets read aloud, retyped, and sometimes
 * transcribed from a screenshot.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const BODY_LENGTH = 5;
const randomBody = customAlphabet(ALPHABET, BODY_LENGTH);

/**
 * The last character is a checksum of the first five.
 *
 * Without it, a code that loses or gains a character is still a *valid-looking*
 * code, and with several events registering at once it can resolve to a
 * different party — registering someone at a wedding they were never invited
 * to, silently, with the wrong host approving them. With it, damage almost
 * always fails to resolve at all, which is the outcome we can recover from.
 */
function checkCharacter(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const index = ALPHABET.indexOf(body[i]);
    if (index < 0) return "";
    sum += index * (i + 1);
  }
  return ALPHABET[sum % ALPHABET.length];
}

export function newRegistrationCode(): string {
  const body = randomBody();
  return body + checkCharacter(body);
}

/** Shape and checksum only — says nothing about whether the event exists. */
export function isWellFormedCode(candidate: string): boolean {
  const code = candidate.toLowerCase();
  if (code.length !== BODY_LENGTH + 1) return false;
  const body = code.slice(0, BODY_LENGTH);
  return checkCharacter(body) === code[BODY_LENGTH];
}

/** Uppercase for anything a person reads; storage and matching stay lowercase. */
export const displayCode = (code: string) => code.toUpperCase();

/**
 * The message we put in the guest's compose box.
 *
 * The code sits at the front and the blank at the end, because WhatsApp drops
 * the cursor at the end: someone typing their name cannot disturb the one part
 * we need. Everything else in the sentence is decoration — the code is found by
 * checksum, not by position, so rewording it costs nothing.
 */
export function prefilledBody(event: LinkFields): string | null {
  if (!event.registrationCode) return null;
  const host = event.hostNames?.trim();
  const who = host ? ` de ${host}` : "";
  return `Regístrame para el evento ${displayCode(event.registrationCode)}${who}. Mi nombre es: `;
}

/** The link the host copies out of Generales: invibot.com/r/ab12cd. */
export function registrationLink(event: LinkFields): string | null {
  if (!event.registrationCode) return null;
  return `${publicBase()}/r/${event.registrationCode}`;
}

/**
 * Where `/r/{code}` sends them. Built from the sending profile's own number,
 * so a test-profile link opens a chat with the test number rather than
 * silently pointing guests at a number that will ignore them.
 */
export function whatsappRegistrationUrl(
  event: LinkFields,
  config: WhatsAppConfig | null = whatsappConfig(),
): string | null {
  const body = prefilledBody(event);
  if (!body || !config?.displayPhone) return null;
  return `https://wa.me/${config.displayPhone}?text=${encodeURIComponent(body)}`;
}

/** Accents and case removed, so "Mi Nombre Es" and "mi nombre es" both match. */
const fold = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type ParsedRegistration = {
  /** Lowercase, checksum-valid. Still has to exist in the database. */
  code: string;
  /** Null when they sent the message without filling the blank. */
  name: string | null;
};

/**
 * Reads an inbound message as a registration attempt, or decides it is not one.
 *
 * Deliberately not anchored to our own wording. People edit the message, drop
 * the accent, or retype it from memory; what survives is the code, and the
 * checksum is what tells a code apart from an ordinary six-letter word.
 */
export function parseRegistration(text: string | null): ParsedRegistration | null {
  if (!text) return null;
  const folded = fold(text);

  // Preferred reading: the token right after "evento", which is where our own
  // wording puts it. Falls back to any checksum-valid token in the message.
  const labelled = folded.match(/evento\s+([a-z0-9]{6})/)?.[1];
  const code =
    labelled && isWellFormedCode(labelled)
      ? labelled
      : (folded.match(/[a-z0-9]{6}/g) ?? []).find(isWellFormedCode);

  if (!code) return null;

  return { code, name: nameFrom(text) };
}

/** What they typed after "Mi nombre es:", if anything. */
function nameFrom(text: string): string | null {
  const folded = fold(text);
  const marker = folded.lastIndexOf("nombre es");
  if (marker < 0) return null;

  const after = text.slice(marker + "nombre es".length).replace(/^[\s:.,-]+/, "");
  return cleanName(after);
}

/**
 * A name, or null. Capped rather than rejected on length: someone who writes a
 * sentence still gets registered, and the host fixes it when approving — the
 * phone number is the part that had to be right, and it already is.
 */
export function cleanName(value: string): string | null {
  const name = value.replace(/\s+/g, " ").trim().slice(0, 80);
  return name.length > 0 ? name : null;
}

const INTERROGATIVES =
  /^(que|qué|cual|cuál|cuando|cuándo|donde|dónde|quien|quién|como|cómo|cuanto|cuánto|por que|porque|puedo|hay|se puede|a que|a qué)\b/;

/**
 * Whether the next message can be taken as the answer to "¿cuál es tu nombre?".
 *
 * Only has to be good enough not to look stupid: the host edits names at
 * approval anyway. What it must not do is record "¿dónde es la fiesta?" as
 * somebody's name and show that to the host as a guest.
 */
export function looksLikeAName(text: string | null): boolean {
  const name = text && cleanName(text);
  if (!name) return false;
  if (/[?¿]/.test(name)) return false;
  if (name.length > 60) return false;
  if (name.split(" ").length > 6) return false;
  return !INTERROGATIVES.test(fold(name));
}

/**
 * Yes and no, for the name-change question only.
 *
 * Deliberately its own vocabulary rather than `parseIntent`'s: that one reads
 * "sí" as confirming attendance, and an unapproved guest answering a question
 * about their name must never be recorded as coming to the party.
 */
const AFFIRMATIVE = new Set(["si", "sii", "siii", "claro", "ok", "okay", "dale", "correcto", "porfa", "porfavor", "adelante", "dale pues", "dale gracias", "dale si"]);
const NEGATIVE = new Set(["no", "nel", "nop", "negativo", "asi esta bien", "asi dejalo", "dejalo asi", "no gracias"]);

export type YesNo = "yes" | "no" | "neither";

export function readYesNo(text: string | null): YesNo {
  if (!text) return "neither";
  const folded = fold(text).replace(/[.!¡?¿,]/g, "").trim();
  if (AFFIRMATIVE.has(folded)) return "yes";
  if (NEGATIVE.has(folded)) return "no";
  // A bare "sí" or "no" buried in a longer sentence is too ambiguous to act on:
  // "no sé cuál es mi nombre completo" is not a refusal.
  return "neither";
}
