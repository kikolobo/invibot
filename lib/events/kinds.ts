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

export const eventKindLabels: Record<EventKind, { es: string; en: string }> = {
  wedding: { es: "Boda", en: "Wedding" },
  birthday: { es: "Cumpleaños", en: "Birthday" },
  quinceanera: { es: "XV años", en: "Quinceañera" },
  corporate: { es: "Evento corporativo", en: "Corporate event" },
  product_launch: { es: "Lanzamiento de producto", en: "Product launch" },
  anniversary: { es: "Aniversario", en: "Anniversary" },
  baby_shower: { es: "Baby shower", en: "Baby shower" },
  graduation: { es: "Graduación", en: "Graduation" },
  other: { es: "Otro", en: "Other" },
};
