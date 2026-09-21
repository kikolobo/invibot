import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guests } from "@/db/schema";
import { cleanName, looksLikeAName } from "./auto-register";

/**
 * Writing down who a guest is bringing, from something they typed.
 *
 * The model decides *when* to ask and when to let it go; this decides what is
 * actually a name. Both halves are needed: a prompt alone would eventually
 * store "todavía no sé" as somebody's partner, and it would print on their QR.
 */

export type CompanionOutcome =
  | { ok: true; name: string }
  | { ok: false; reason: "not_allowed" | "unclear" | "not_found" };

/**
 * The ways people say "I don't know yet".
 *
 * Matched against the whole answer, not inside it: "Aún no sé" is not a name,
 * but "Ana Aunsolis" must not be caught by a substring search for "aun".
 */
const UNKNOWN =
  /^(a[uú]n no|todav[ií]a no|no s[eé]|no lo s[eé]|no estoy segur|no he invitad|no s[eé] todav|luego te digo|despu[eé]s te digo|te digo luego|te aviso|no s[eé] a[uú]n|ninguno|nadie|pendiente|estoy pensando)/i;

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * "mi esposa Ana" → "Ana".
 *
 * The tool asks for the name alone and mostly gets it, but the relationship
 * rides along often enough to be worth stripping: otherwise the door list reads
 * "Mi Esposa Ana", and so does her pass.
 */
const RELATION =
  /^(?:(?:mi|el|la|su)\s+)?(?:esposa|esposo|mujer|marido|pareja|novia|novio|amiga|amigo|hermana|hermano|mam[aá]|pap[aá]|hija|hijo|prima|primo|cu[nñ]ada|cu[nñ]ado|se[nñ]ora|se[nñ]or|acompa[nñ]ante|invitada|invitado)(?:\s+(?:se\s+llama\s+)?|$)/i;

function stripRelation(text: string): string {
  const trimmed = text.replace(/^(?:se\s+llama|es)\s+/i, "").trim();
  // What is left may be nothing at all — "mi esposa" with no name after it —
  // and nothing is the right answer: it fails the name check below, and the
  // guest is asked again rather than having "Mi Esposa" printed on a pass.
  return trimmed.replace(RELATION, "").trim();
}

export async function recordCompanionName(
  guestId: string,
  raw: string,
): Promise<CompanionOutcome> {
  const guest = await db.query.guests.findFirst({ where: eq(guests.id, guestId) });
  if (!guest) return { ok: false, reason: "not_found" };

  // An invitation for one has nobody to name, whatever the model was told.
  if (guest.partySizeAllowed < 2) return { ok: false, reason: "not_allowed" };

  const answer = stripRelation(raw.trim());
  if (UNKNOWN.test(answer) || UNKNOWN.test(fold(answer))) return { ok: false, reason: "unclear" };

  const name = cleanName(answer);
  if (!name || !looksLikeAName(name)) return { ok: false, reason: "unclear" };

  await db
    .update(guests)
    .set({ companions: [name], updatedAt: new Date() })
    .where(eq(guests.id, guestId));

  return { ok: true, name };
}
