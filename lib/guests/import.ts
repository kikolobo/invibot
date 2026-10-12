import { normalizePhone, variantsOf } from "@/lib/phone";

/**
 * Parses a pasted or uploaded guest list.
 *
 * Organizers arrive with a spreadsheet, not a CSV spec, so this is deliberately
 * forgiving: it sniffs the delimiter, detects a header row in Spanish or
 * English, and reports problems per row instead of rejecting the whole file.
 * A list of 200 guests where three phone numbers are malformed should import
 * 197 and tell you about the three.
 */

export type IssueLevel = "error" | "warning";
export type Issue = { level: IssueLevel; message: string };

export type RsvpStatus = "no_response" | "confirmed" | "declined" | "maybe" | "waitlist";
export type ApprovalStatus = "approved" | "pending" | "rejected";

/**
 * The words the export writes, so the import can read its own file back.
 * Shared rather than duplicated: a label changed on one side only is a column
 * that silently stops round-tripping.
 */
export const RSVP_LABELS: Record<RsvpStatus, string> = {
  no_response: "Sin responder",
  confirmed: "Confirmado",
  declined: "No podrá",
  maybe: "Tal vez",
  waitlist: "Lista de espera",
};

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  rejected: "Rechazado",
};

export type ParsedGuest = {
  row: number;
  fullName: string;
  firstName: string | null;
  phoneE164: string | null;
  phoneVariants: string[];
  email: string | null;
  groupLabel: string | null;
  partySizeAllowed: number;
  /** The +1 by name. Only kept when the guest has a second seat. */
  companionName: string | null;
  tableNumber: string | null;
  isVip: boolean;
  notes: string | null;
  rsvpStatus: RsvpStatus;
  /** Seats confirmed; null unless `rsvpStatus` is confirmed. */
  partySizeConfirmed: number | null;
  approvalStatus: ApprovalStatus;
  optedOut: boolean;
  issues: Issue[];
};

export type ParseResult = {
  guests: ParsedGuest[];
  /** Problems with the file as a whole rather than one row. */
  fileIssues: Issue[];
  headerDetected: boolean;
};

type Column =
  | "name"
  | "phone"
  | "email"
  | "group"
  | "party"
  | "companion"
  | "table"
  | "vip"
  | "notes"
  | "rsvp"
  | "confirmed"
  | "approval"
  | "optout"
  // Known so the header is recognised, read by nobody: whether an invitation
  // went out is something Meta tells us, not something a file can claim.
  | "ignored";

/** Header labels we recognise, accent-stripped and lowercased. */
const HEADERS: Record<string, Column> = {
  nombre: "name", name: "name", invitado: "name", guest: "name",
  "nombre completo": "name", "full name": "name",
  telefono: "phone", tel: "phone", celular: "phone", movil: "phone",
  whatsapp: "phone", phone: "phone", mobile: "phone", numero: "phone",
  email: "email", correo: "email", "correo electronico": "email", mail: "email",
  grupo: "group", group: "group", familia: "group", relacion: "group",
  // "mesa" used to mean group here, from before tables existed as a field.
  // A spreadsheet with a Mesa column was importing table numbers as group
  // names, which is the kind of wrong that looks right until the door.
  mesa: "table", table: "table", "numero de mesa": "table", "mesa asignada": "table",
  vip: "vip", importante: "vip",
  acompanantes: "party", pases: "party", party: "party", guests: "party",
  lugares: "party", "lugares ofrecidos": "party",
  // Singular is a person, plural is a count — "Acompañantes: 2" has always
  // meant seats in the lists people bring.
  acompanante: "companion", pareja: "companion", "plus one": "companion",
  companion: "companion", "nombre del acompanante": "companion",
  notas: "notes", nota: "notes", notes: "notes", comentarios: "notes",
  observaciones: "notes",
  asistencia: "rsvp", rsvp: "rsvp", confirmacion: "rsvp", respuesta: "rsvp",
  confirmados: "confirmed", "personas confirmadas": "confirmed",
  "lugares confirmados": "confirmed",
  aprobacion: "approval", aprobado: "approval", approval: "approval",
  baja: "optout", "opted out": "optout",
  invitacion: "ignored",
};

/** Accent-stripped spellings people type, beyond the labels we export. */
const RSVP_WORDS: Record<string, RsvpStatus> = {
  ...Object.fromEntries(
    Object.entries(RSVP_LABELS).flatMap(([status, label]) => [
      [label.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(), status],
      [status.replace("_", " "), status],
    ]),
  ),
  "": "no_response", pendiente: "no_response",
  confirmada: "confirmed", si: "confirmed", yes: "confirmed", asiste: "confirmed",
  "no podra": "declined", no: "declined", "no asiste": "declined", declinado: "declined",
  "tal vez": "maybe", quizas: "maybe", quiza: "maybe",
  "lista de espera": "waitlist",
};

const APPROVAL_WORDS: Record<string, ApprovalStatus> = {
  "": "approved", aprobado: "approved", aprobada: "approved", si: "approved", approved: "approved",
  pendiente: "pending", pending: "pending", "por aprobar": "pending",
  rechazado: "rejected", rechazada: "rejected", no: "rejected", rejected: "rejected",
};

const YES = ["si", "yes", "x", "1", "true", "vip", "v"];

const strip = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

/**
 * Sniffs the delimiter. Semicolons matter: Excel on a Spanish-locale machine
 * writes CSV with `;` because the comma is the decimal separator, and that is
 * exactly the machine our organizers use.
 */
function sniffDelimiter(sample: string): string {
  const counts: Record<string, number> = {
    "\t": (sample.match(/\t/g) ?? []).length,
    ";": (sample.match(/;/g) ?? []).length,
    ",": (sample.match(/,/g) ?? []).length,
  };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

/**
 * RFC 4180, over the whole text rather than line by line: a note typed with a
 * line break comes out of a spreadsheet as a quoted cell spanning two lines,
 * and splitting on newlines first turned it into two broken rows.
 */
function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field.trim());
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\n") {
      endRow();
    } else {
      field += ch;
    }
  }
  endRow();
  return rows;
}

function firstNameOf(fullName: string): string | null {
  const first = fullName.trim().split(/\s+/)[0];
  return first || null;
}

export function parseGuestList(input: string, maxPartySize = 1): ParseResult {
  const fileIssues: Issue[] = [];
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    return { guests: [], fileIssues: [{ level: "error", message: "No hay nada que importar." }], headerDetected: false };
  }

  const delimiter = sniffDelimiter(lines.slice(0, 5).join("\n"));

  // Header detection: a first row where at least one cell is a known label and
  // no cell looks like a phone number.
  const table = parseRows(text, delimiter);
  const firstCells = table[0] ?? [];
  const looksLikeHeader =
    firstCells.some((c) => HEADERS[strip(c)] !== undefined) &&
    !firstCells.some((c) => /\d{7,}/.test(c));

  let columns: Column[];
  if (looksLikeHeader) {
    columns = firstCells.map((c) => HEADERS[strip(c)] ?? ("" as Column));
    if (!columns.includes("name")) {
      fileIssues.push({
        level: "warning",
        message: "No encontramos una columna de nombre; usamos la primera.",
      });
      columns[0] = "name";
    }
  } else {
    // No header: assume the conventional order.
    columns = ["name", "phone", "email", "group", "party"];
  }

  const rows = looksLikeHeader ? table.slice(1) : table;
  const guests: ParsedGuest[] = [];
  const seen = new Map<string, number>();

  rows.forEach((cells, index) => {
    const pick = (column: Column): string => {
      const at = columns.indexOf(column);
      return at >= 0 ? (cells[at] ?? "") : "";
    };

    const issues: Issue[] = [];
    const fullName = pick("name").trim();
    const rawPhone = pick("phone").trim();
    const rawEmail = pick("email").trim();
    const group = pick("group").trim();
    const rawParty = pick("party").trim();
    const rawTable = pick("table").trim();
    const rawVip = pick("vip").trim();
    const rawCompanion = pick("companion").replace(/\s+/g, " ").trim();
    const rawNotes = pick("notes").trim();
    const rawRsvp = pick("rsvp").trim();
    const rawConfirmed = pick("confirmed").trim();
    const rawApproval = pick("approval").trim();
    const rawOptOut = pick("optout").trim();

    if (!fullName) issues.push({ level: "error", message: "Falta el nombre." });

    let phoneE164: string | null = null;
    let phoneVariants: string[] = [];
    if (rawPhone) {
      const normalized = normalizePhone(rawPhone);
      if (normalized) {
        phoneE164 = normalized.e164;
        phoneVariants = normalized.variants;
      } else {
        issues.push({ level: "error", message: `Teléfono no válido: "${rawPhone}"` });
      }
    }

    let email: string | null = null;
    if (rawEmail) {
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) email = rawEmail.toLowerCase();
      else issues.push({ level: "warning", message: `Correo no válido: "${rawEmail}"` });
    }

    if (!phoneE164 && !email) {
      issues.push({
        level: "error",
        message: "Sin teléfono ni correo no hay forma de enviar la invitación.",
      });
    }

    // The event's offer is the default here too, so importing a list into an
    // event with companions does not quietly deny every one of them.
    let partySizeAllowed = maxPartySize;
    if (rawParty) {
      const n = Number.parseInt(rawParty, 10);
      if (Number.isFinite(n) && n >= 1) {
        partySizeAllowed = Math.min(n, maxPartySize);
        if (n > maxPartySize) {
          issues.push({
            level: "warning",
            message: `Pediste ${n} lugares pero el máximo del evento es ${maxPartySize}.`,
          });
        }
      } else {
        issues.push({ level: "warning", message: `Número de pases no válido: "${rawParty}"` });
      }
    }

    // Same rule as the form: digits, at most five, and "0005" is table 5.
    let tableNumber: string | null = null;
    if (rawTable) {
      if (/^\d{1,5}$/.test(rawTable)) {
        const normalized = String(Number.parseInt(rawTable, 10));
        if (normalized === "0") {
          issues.push({ level: "warning", message: "La mesa no puede ser 0; se dejó vacía." });
        } else {
          tableNumber = normalized;
        }
      } else {
        issues.push({
          level: "warning",
          message: `Mesa no válida: "${rawTable}". Debe ser un número de hasta 5 dígitos.`,
        });
      }
    }

    // A column people fill with an x, a 1, or the word itself. Anything else
    // is left as not-VIP rather than guessed at — marking the wrong person is
    // worse than marking nobody.
    const isVip = YES.includes(strip(rawVip));

    let companionName: string | null = null;
    if (rawCompanion) {
      if (partySizeAllowed >= 2) companionName = rawCompanion.slice(0, 80);
      else {
        issues.push({
          level: "warning",
          message: `"${rawCompanion}" no se guardó: este invitado no tiene lugar para acompañante.`,
        });
      }
    }

    const rsvpStatus: RsvpStatus = RSVP_WORDS[strip(rawRsvp)] ?? "no_response";
    if (RSVP_WORDS[strip(rawRsvp)] === undefined) {
      issues.push({ level: "warning", message: `Asistencia no reconocida: "${rawRsvp}"; quedó sin responder.` });
    }

    // Same clamp as the edit form: confirming two for a single seat is not
    // expressible, and a blank count on a confirmed guest means just them.
    let partySizeConfirmed: number | null = null;
    if (rsvpStatus === "confirmed") {
      const n = Number.parseInt(rawConfirmed, 10);
      partySizeConfirmed = Number.isFinite(n) && n >= 1 ? Math.min(n, partySizeAllowed) : 1;
      if (Number.isFinite(n) && n > partySizeAllowed) {
        issues.push({
          level: "warning",
          message: `Confirmó ${n} pero solo tiene ${partySizeAllowed} ${partySizeAllowed === 1 ? "lugar" : "lugares"}.`,
        });
      }
    }

    // Unrecognised approval stays pending, never approved: guessing "approved"
    // would let someone the host turned away receive an invitation.
    const approvalStatus: ApprovalStatus = APPROVAL_WORDS[strip(rawApproval)] ?? "pending";
    if (APPROVAL_WORDS[strip(rawApproval)] === undefined) {
      issues.push({ level: "warning", message: `Aprobación no reconocida: "${rawApproval}"; quedó pendiente.` });
    }

    const optedOut = YES.includes(strip(rawOptOut));

    // Duplicates within the file itself, matched on any phone variant.
    const key = phoneE164 ?? (email ? `mail:${email}` : "");
    if (key) {
      const previous = seen.get(key);
      if (previous !== undefined) {
        issues.push({
          level: "error",
          message: `Repetido: ya aparece en la fila ${previous}.`,
        });
      } else {
        seen.set(key, index + 1);
        for (const variant of phoneVariants) seen.set(variant, index + 1);
      }
    }

    guests.push({
      row: index + 1,
      fullName,
      firstName: firstNameOf(fullName),
      phoneE164,
      phoneVariants: phoneE164 ? variantsOf(phoneE164) : [],
      email,
      groupLabel: group || null,
      partySizeAllowed,
      companionName,
      tableNumber,
      isVip,
      notes: rawNotes || null,
      rsvpStatus,
      partySizeConfirmed,
      approvalStatus,
      optedOut,
      issues,
    });
  });

  return { guests, fileIssues, headerDetected: looksLikeHeader };
}

export const hasError = (guest: ParsedGuest) =>
  guest.issues.some((i) => i.level === "error");
