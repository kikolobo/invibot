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
  inviteStatus: string;
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

/**
 * Grouping and ordering are independent: a list can be grouped by table and
 * still read alphabetically inside each one. Folding "grupo" into the sort was
 * a false choice.
 */
export const orders = {
  nombre: "Nombre",
  apellido: "Apellido",
} as const;

export type OrderKey = keyof typeof orders;
export type Direction = "asc" | "desc";

export type ReportShape = {
  order: OrderKey;
  direction: Direction;
  /** Sections by group instead of by initial letter. */
  grouped: boolean;
};

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

/**
 * Splits the list into the sections a reader scans by.
 *
 * Grouped, the heading is the group and the ordering runs inside it. Ungrouped,
 * the heading is the initial of whichever name is being read — which is the
 * point of the big letter: someone looking for Federico looks under F, not
 * through ninety rows.
 */
export function buildSections(guests: ReportGuest[], shape: ReportShape): ReportSection[] {
  const sign = shape.direction === "desc" ? -1 : 1;

  const nameOf = (guest: ReportGuest) =>
    shape.order === "apellido" ? surnameOf(guest) : given(guest);

  const sorted = [...guests].sort((a, b) => {
    const primary = sortKey(nameOf(a)).localeCompare(sortKey(nameOf(b)), "es");
    if (primary !== 0) return primary * sign;
    // A stable second key, so two Lobos keep a predictable order.
    return sortKey(given(a)).localeCompare(sortKey(given(b)), "es") * sign;
  });

  const sections = new Map<string, ReportGuest[]>();
  for (const guest of sorted) {
    const heading = shape.grouped ? (guest.groupName ?? "Sin grupo") : initial(nameOf(guest));
    const bucket = sections.get(heading);
    if (bucket) bucket.push(guest);
    else sections.set(heading, [guest]);
  }

  // Leftovers sort last whichever way the list runs: "Sin grupo" is not a group
  // and "#" is not a letter, and putting either first buries the real content.
  const last = shape.grouped ? "Sin grupo" : "#";

  return [...sections.entries()]
    .map(([heading, list]) => ({ heading, guests: list }))
    .sort((a, b) => {
      if (a.heading === last) return 1;
      if (b.heading === last) return -1;
      return sortKey(a.heading).localeCompare(sortKey(b.heading), "es") * sign;
    });
}


/** An invitation that actually left: queued and failed never reached a phone. */
const wasSent = (guest: ReportGuest) =>
  guest.inviteStatus === "sent" ||
  guest.inviteStatus === "delivered" ||
  guest.inviteStatus === "read";

/**
 * The state of the whole list at a glance.
 *
 * The three middle rows are the ones worth separating: "sin leer" and "sin
 * confirmar" both look like silence on a list, but they are different problems.
 * A guest who never opened the message may have a dead number or a phone in a
 * drawer; a guest who read it and said nothing is deciding, and chasing them is
 * a different conversation. The numbers rely on WhatsApp read receipts, which a
 * guest can switch off — someone with them disabled stays in "sin leer" forever
 * however carefully they read it.
 */
export type ReportSummary = {
  enviadas: number;
  sinEnviar: number;
  confirmados: number;
  lugares: number;
  sinLeer: number;
  sinConfirmar: number;
  cancelados: number;
};

export function summarize(guests: ReportGuest[]): ReportSummary {
  const summary: ReportSummary = {
    enviadas: 0,
    sinEnviar: 0,
    confirmados: 0,
    lugares: 0,
    sinLeer: 0,
    sinConfirmar: 0,
    cancelados: 0,
  };

  for (const guest of guests) {
    if (wasSent(guest)) summary.enviadas++;
    else summary.sinEnviar++;

    if (guest.rsvpStatus === "confirmed") {
      summary.confirmados++;
      summary.lugares += seatsOf(guest);
    }

    if (guest.rsvpStatus === "declined") summary.cancelados++;

    if (guest.rsvpStatus === "no_response" && wasSent(guest)) {
      if (guest.inviteStatus === "read") summary.sinConfirmar++;
      else summary.sinLeer++;
    }
  }

  return summary;
}
