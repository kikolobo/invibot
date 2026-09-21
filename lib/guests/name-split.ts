import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropicFromEnv } from "@/lib/agent/run";
import { cleanName, looksLikeAName } from "./auto-register";

/**
 * Two people, one registration.
 *
 * "Laura y Pedro Bap" is a couple registering together, and until now it was
 * one guest called "Laura y Pedro Bap" — printed that way on the door list and
 * on their pass. This reads it as two people.
 *
 * The model is a parser here and nothing else. It never sees the event, never
 * writes a word the guest reads, and every answer it gives is checked against
 * the text it was given: a name whose words are not in the original is thrown
 * away. That keeps the property auto-registro is built on — nothing that knows
 * where the party is talks to somebody the host has not approved — while still
 * using the one thing a model is genuinely better at than a regex.
 *
 * Failure is never fatal. No API key, a rate limit, a shape we did not expect:
 * the caller falls back to storing the line as typed, which is exactly what
 * happened before this existed, and the host fixes it when approving.
 */

/** Who they named, in the order they wrote them. */
export type SplitPerson = {
  /** Given name, always present. */
  first: string;
  /** Surname, when they gave one. */
  last: string | null;
};

export type SplitNames = {
  people: SplitPerson[];
  /** Words that were not names — "y familia", "+1", "mi esposa". */
  note: string | null;
};

/**
 * Whether the line is worth a model call.
 *
 * Most registrations are one person with one name and never touch the API.
 * The separators are the only way two people arrive in one line, so anything
 * without one is not ambiguous and costs nothing to decide.
 */
export function mightBeTwoNames(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  return /(\s+(y|e|con)\s+)|&|\+|,/i.test(text);
}

const Schema = z.object({
  people: z
    .array(
      z.object({
        first: z.string().describe("Nombre de pila, como lo escribió la persona"),
        last: z
          .string()
          .nullable()
          .describe("Apellido(s) si los escribió; null si no los escribió"),
      }),
    )
    .describe("Las personas mencionadas, en el orden en que aparecen"),
  note: z
    .string()
    .nullable()
    .describe("Lo que no era un nombre: «y familia», «+1», «mi esposa». null si no hay nada"),
});

const SYSTEM = [
  "Separas nombres de personas. Recibes una línea tal como la escribió alguien al registrarse a un evento y devuelves quiénes son.",
  "",
  "Reglas:",
  "- Sólo usa palabras que están en el texto. Nunca inventes ni completes un apellido, aunque parezca obvio.",
  "- «Laura y Pedro Bap» son DOS personas. «Bap» es ambiguo: déjalo sólo en Pedro, que es junto a quien está escrito.",
  "- «María José» es UNA persona: un nombre compuesto no lleva «y» en medio.",
  "- «Ana y familia», «Ana +1», «Ana y esposo» es UNA persona con nota: la otra no tiene nombre.",
  "- Si sólo hay un nombre, devuelve una sola persona.",
  "- Nunca respondas con texto, sólo con la estructura.",
].join("\n");

/** Where the parsing came from, so a caller can log why nothing happened. */
export type SplitOutcome =
  | { ok: true; names: SplitNames }
  | { ok: false; reason: "not_ambiguous" | "unavailable" | "unusable" };

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Every word of a parsed name has to be in what they typed.
 *
 * The one failure mode worth engineering against: a model that helpfully turns
 * "Laura y Pedro Bap" into "Laura Bap y Pedro Bap". Both are plausible; only
 * one is what they wrote, and the other puts a surname that may not be hers on
 * a guest list.
 */
function saidIt(name: string, source: string): boolean {
  const words = fold(source).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return fold(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .every((word) => words.includes(word));
}

export async function splitNames(raw: string): Promise<SplitOutcome> {
  if (!mightBeTwoNames(raw)) return { ok: false, reason: "not_ambiguous" };

  const client = anthropicFromEnv();
  if (!client) return { ok: false, reason: "unavailable" };

  let parsed: z.infer<typeof Schema> | null = null;
  try {
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
      max_tokens: 1024,
      // A line of names needs no deliberation, and this runs inside the
      // webhook's `after`, where a guest is waiting on the reply.
      output_config: { effort: "low", format: zodOutputFormat(Schema) },
      system: SYSTEM,
      messages: [{ role: "user", content: raw.slice(0, 200) }],
    });
    parsed = response.parsed_output;
  } catch (error) {
    console.error("[names] could not split", error);
    return { ok: false, reason: "unavailable" };
  }

  if (!parsed || parsed.people.length === 0) return { ok: false, reason: "unusable" };

  const people: SplitPerson[] = [];
  for (const person of parsed.people) {
    if (!saidIt(person.first, raw)) return { ok: false, reason: "unusable" };
    if (person.last && !saidIt(person.last, raw)) return { ok: false, reason: "unusable" };

    // The same idea of what a name is that every other name goes through — so
    // "y familia" read as a person cannot become a guest.
    const first = cleanName(person.first);
    if (!first || !looksLikeAName(first)) return { ok: false, reason: "unusable" };

    // The surname is kept as typed and cased later, with the given name beside
    // it: on its own, "de Hoyos" becomes "De Hoyos" — right for a surname
    // standing alone, wrong the moment it follows "Eugenia".
    const last = person.last?.replace(/\s+/g, " ").trim() || null;
    if (last && !looksLikeAName(last)) {
      people.push({ first, last: null });
      continue;
    }

    people.push({ first, last });
  }

  return { ok: true, names: { people, note: parsed.note?.trim() || null } };
}

/**
 * The name as it is stored: "Laura Cantú", or just "Laura".
 *
 * Cased as one string rather than two, because the particles only know where
 * they are in a whole name: "de Hoyos" is right after "Eugenia" and wrong on
 * its own, where "De Hoyos" is a surname.
 */
export const fullNameOf = (person: SplitPerson) =>
  person.last ? (cleanName(`${person.first} ${person.last}`) ?? person.first) : person.first;
