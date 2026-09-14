import type { EventKind } from "@/lib/events/kinds";

/**
 * Guest groups are a controlled vocabulary per event, not free text.
 *
 * Left open, a list of 200 guests reliably grows "Familia novia", "familia de
 * la novia" and "Fam. de la novia" as three separate groups, which makes
 * filtering and seating useless. Names are matched on a normalized form so
 * casing, accents and spacing collapse to one group.
 */

/** Matching key: accent-stripped, lowercased, punctuation and filler removed. */
export function normalizeGroupName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !["de", "del", "la", "el", "los", "las"].includes(word))
    .join(" ");
}

/** Tidy a name for display: collapse whitespace, capitalise the first letter. */
export function cleanGroupName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 60);
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Seeded when an event is created, so the organizer picks from a sensible list
 * instead of inventing one. They can still add their own.
 */
const byKind: Partial<Record<EventKind, string[]>> = {
  wedding: [
    "Familia de la novia",
    "Familia del novio",
    "Amigos de la novia",
    "Amigos del novio",
    "Padrinos",
    "Trabajo",
  ],
  quinceanera: [
    "Familia",
    "Chambelanes",
    "Damas",
    "Padrinos",
    "Escuela",
    "Amigos de los papás",
  ],
  corporate: ["Clientes", "Prospectos", "Equipo interno", "Proveedores", "Prensa"],
  product_launch: ["Clientes", "Prensa", "Influencers", "Equipo interno", "Inversionistas"],
  birthday: ["Familia", "Amigos", "Trabajo", "Escuela", "Vecinos"],
  anniversary: ["Familia", "Amigos", "Trabajo"],
  baby_shower: ["Familia", "Amigas", "Trabajo"],
  graduation: ["Familia", "Compañeros", "Profesores"],
};

export function suggestedGroups(kind: EventKind): string[] {
  return byKind[kind] ?? ["Familia", "Amigos", "Trabajo"];
}
