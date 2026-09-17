/**
 * The canonical list of event kinds. Defined here rather than in the Drizzle
 * schema so the question catalog and the UI can depend on it without importing
 * the database layer; `db/schema/enums.ts` builds its pgEnum from this.
 */
export const eventKinds = [
  "wedding",
  "birthday",
  "quinceanera",
  "corporate",
  "product_launch",
  "anniversary",
  "baby_shower",
  "graduation",
  "other",
] as const;

export type EventKind = (typeof eventKinds)[number];

/**
 * `es` is a label — it heads a column and starts a sentence. `esInline` is the
 * same thing said mid-sentence, article included, because Spanish will not let
 * us assemble one: it is *la* boda and *el* cumpleaños and *los* XV años, and
 * no amount of string concatenation gets that right.
 *
 * `other` has no noun of its own — "para el otro" means nothing — so it falls
 * back to the generic word.
 */
export const eventKindLabels: Record<EventKind, { es: string; en: string; esInline: string }> = {
  wedding: { es: "Boda", en: "Wedding", esInline: "la boda" },
  birthday: { es: "Cumpleaños", en: "Birthday", esInline: "el cumpleaños" },
  quinceanera: { es: "XV años", en: "Quinceañera", esInline: "los XV años" },
  corporate: { es: "Evento corporativo", en: "Corporate event", esInline: "el evento corporativo" },
  product_launch: {
    es: "Lanzamiento de producto",
    en: "Product launch",
    esInline: "el lanzamiento de producto",
  },
  anniversary: { es: "Aniversario", en: "Anniversary", esInline: "el aniversario" },
  baby_shower: { es: "Baby shower", en: "Baby shower", esInline: "el baby shower" },
  graduation: { es: "Graduación", en: "Graduation", esInline: "la graduación" },
  other: { es: "Otro", en: "Other", esInline: "el evento" },
};
