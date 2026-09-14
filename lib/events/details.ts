import { z } from "zod";

/**
 * The informational answers from the intake questionnaire — everything that describes
 * the event but does not drive application behaviour. Behaviour-driving fields
 * (rsvpRequired, rsvpDeadline, allowPlusOnes, capacity, dates) are typed columns on
 * `events` instead.
 *
 * Stored as JSONB so adding a question is a data change, not a migration. Validated
 * here so it is fully typed in TypeScript anyway, and reused as the intake form
 * validator, the API boundary check, and the shape the agent reads.
 */

export const settingSchema = z.enum(["indoor", "outdoor", "both", "undecided"]);

export const rainPolicySchema = z.enum([
  "covered", // there is a covered alternative on site
  "postponed",
  "cancelled",
  "rain_or_shine",
  "undecided",
]);

export const mealSchema = z.enum([
  "none",
  "canapes",
  "brunch",
  "lunch",
  "dinner",
  "dessert_only",
]);

export const drinksSchema = z.enum([
  "open_bar",
  "limited_bar",
  "byob",
  "soft_drinks_only",
  "none",
]);

export const attireSchema = z.enum([
  "casual",
  "smart_casual",
  "cocktail",
  "formal",
  "black_tie",
  "themed",
]);

export const photographySchema = z.enum([
  "encouraged",
  "unplugged", // please keep phones away
  "no_flash",
  "not_specified",
]);

export const parkingSchema = z.object({
  valet: z.boolean().default(false),
  onSite: z.boolean().default(false),
  street: z.boolean().default(false),
  paid: z.boolean().default(false),
  validated: z.boolean().default(false),
  note: z.string().max(500).nullable().default(null),
});

export const costSchema = z.object({
  isFree: z.boolean().default(true),
  amountMinor: z.number().int().nonnegative().nullable().default(null),
  currency: z.string().length(3).default("MXN"),
  /** How to pay, deadlines, what the fee covers. */
  note: z.string().max(1000).nullable().default(null),
});

export const registrySchema = z.object({
  hasRegistry: z.boolean().default(false),
  urls: z.array(z.url()).max(5).default([]),
  /** e.g. "lluvia de sobres" — common in MX and not a URL. */
  note: z.string().max(500).nullable().default(null),
});

export const eventDetailsSchema = z.object({
  setting: settingSchema.default("undecided"),
  rainPolicy: rainPolicySchema.default("undecided"),
  parking: parkingSchema.prefault({}),
  /** e.g. "Recomendamos Uber o taxi, el estacionamiento es limitado." */
  transportSuggestion: z.string().max(500).nullable().default(null),
  meal: mealSchema.default("none"),
  drinks: drinksSchema.default("none"),
  attire: attireSchema.default("casual"),
  attireNote: z.string().max(500).nullable().default(null),
  cost: costSchema.prefault({}),
  /** What guests should bring, if anything. */
  bringSomething: z.string().max(500).nullable().default(null),
  kidsWelcome: z.boolean().default(true),
  petsWelcome: z.boolean().default(false),
  accessibilityNote: z.string().max(1000).nullable().default(null),
  registry: registrySchema.prefault({}),
  /** e.g. "La ceremonia empieza puntual, llega 20 minutos antes." */
  arrivalNote: z.string().max(500).nullable().default(null),
  endTimeNote: z.string().max(500).nullable().default(null),
  photography: photographySchema.default("not_specified"),
  /** Anything else the organizer typed free-form. Fed to the agent verbatim. */
  customNotes: z.string().max(4000).nullable().default(null),
  /**
   * Answers to questions specific to one event kind (padrinos for a quinceañera,
   * badge pickup for a corporate event). Keys come from the question catalog.
   */
  extras: z.record(z.string(), z.union([z.string(), z.boolean(), z.number(), z.null()])).default({}),
});

export type EventDetails = z.infer<typeof eventDetailsSchema>;

export const emptyEventDetails = (): EventDetails => eventDetailsSchema.parse({});
