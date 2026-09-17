/**
 * The guest list, cut and sorted for whoever is standing at the door.
 *
 * Pure on purpose: the filters and the ordering decide who gets let in, and
 * that logic is worth testing without a database or a browser.
 */

export type ReportGuest = {
  id: string;
  fullName: string;
  firstName: string | null;
  groupName: string | null;
  rsvpStatus: string;
  partySizeConfirmed: number | null;
  partySizeAllowed: number;
};

export const filters = {
  todos: "Todos",
  confirmados: "Confirmados",
  con_acompanante: "Confirmados con +1",
  individuales: "Confirmados individuales",
  cancelados: "Cancelados",
  sin_responder: "No contestaron",
  pendientes: "No han confirmado",
} as const;

export type FilterKey = keyof typeof filters;

export const orders = {
  nombre: "Nombre",
  apellido: "Apellido",
  grupo: "Grupo",
} as const;

export type OrderKey = keyof typeof orders;

export const isFilter = (value: string): value is FilterKey => value in filters;
export const isOrder = (value: string): value is OrderKey => value in orders;

/** Seats this guest occupies. An unanswered count means the one they were given. */
export const seatsOf = (guest: ReportGuest): number =>
  guest.rsvpStatus === "confirmed" ? (guest.partySizeConfirmed ?? 1) : 0;

export function applyFilter(guests: ReportGuest[], filter: FilterKey): ReportGuest[] {
  switch (filter) {
    case "todos":
      return guests;
    case "confirmados":
      return guests.filter((g) => g.rsvpStatus === "confirmed");
    case "con_acompanante":
      return guests.filter((g) => g.rsvpStatus === "confirmed" && seatsOf(g) >= 2);
    case "individuales":
      return guests.filter((g) => g.rsvpStatus === "confirmed" && seatsOf(g) === 1);
    case "cancelados":
      return guests.filter((g) => g.rsvpStatus === "declined");
    case "sin_responder":
      return guests.filter((g) => g.rsvpStatus === "no_response");
    // Everyone still unresolved. A decline is an answer, so it is not here —
    // this is the chase list, and chasing someone who already said no is worse
    // than not chasing at all.
    case "pendientes":
      return guests.filter((g) => g.rsvpStatus === "no_response" || g.rsvpStatus === "maybe");
  }
}

const given = (guest: ReportGuest): string =>
  guest.firstName?.trim() || guest.fullName.trim().split(/\s+/)[0] || guest.fullName;

/**
 * The surname to file someone under.
 *
 * A guess, and it has to be: "Francisco Lobo Salas" files under Lobo, because
 * Mexican names run given-name, paternal, maternal, and the paternal surname is
 * what a door list is read by. It gets "María Fernanda Ruiz" wrong — two given
 * names shift everything along — and there is no way to tell the two apart from
 * the string. Anyone filed oddly can be looked up by their first name instead.
 */
export function surnameOf(guest: ReportGuest): string {
  const parts = guest.fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  // When `firstName` is known, everything after it is surname territory.
  const first = guest.firstName?.trim();
  if (first && parts.length > 1 && parts[0].toLowerCase() === first.toLowerCase()) {
    return parts[1];
  }
  return parts[1] ?? parts[0];
}

/** Accent-insensitive, so "Ángel" files under A and not after Z. */
const sortKey = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const initial = (value: string) => {
  const letter = sortKey(value).charAt(0).toUpperCase();
  return /[A-Z]/.test(letter) ? letter : "#";
};

export type ReportSection = { heading: string; guests: ReportGuest[] };

export function buildSections(guests: ReportGuest[], order: OrderKey): ReportSection[] {
  const sorted = [...guests].sort((a, b) => {
    if (order === "apellido") {
      const bySurname = sortKey(surnameOf(a)).localeCompare(sortKey(surnameOf(b)), "es");
      if (bySurname !== 0) return bySurname;
    }
    return sortKey(given(a)).localeCompare(sortKey(given(b)), "es");
  });

  const sections = new Map<string, ReportGuest[]>();
  for (const guest of sorted) {
    const heading =
      order === "grupo"
        ? (guest.groupName ?? "Sin grupo")
        : initial(order === "apellido" ? surnameOf(guest) : given(guest));
    const bucket = sections.get(heading);
    if (bucket) bucket.push(guest);
    else sections.set(heading, [guest]);
  }

  const result = [...sections.entries()].map(([heading, list]) => ({ heading, guests: list }));

  if (order === "grupo") {
    // Alphabetical, but "Sin grupo" last — it is the leftovers, not a group.
    result.sort((a, b) => {
      if (a.heading === "Sin grupo") return 1;
      if (b.heading === "Sin grupo") return -1;
      return sortKey(a.heading).localeCompare(sortKey(b.heading), "es");
    });
  } else {
    result.sort((a, b) => {
      if (a.heading === "#") return 1;
      if (b.heading === "#") return -1;
      return a.heading.localeCompare(b.heading, "es");
    });
  }

  return result;
}
