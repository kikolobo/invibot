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

export type ParsedGuest = {
  row: number;
  fullName: string;
  firstName: string | null;
  phoneE164: string | null;
  phoneVariants: string[];
  email: string | null;
  groupLabel: string | null;
  partySizeAllowed: number;
  tableNumber: string | null;
  isVip: boolean;
  issues: Issue[];
};

export type ParseResult = {
  guests: ParsedGuest[];
  /** Problems with the file as a whole rather than one row. */
  fileIssues: Issue[];
  headerDetected: boolean;
};

type Column = "name" | "phone" | "email" | "group" | "party" | "table" | "vip";

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
  lugares: "party",
};

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

/** Minimal RFC4180-ish splitter: honours quotes and doubled quotes inside them. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field.trim());
  return out;
}

function firstNameOf(fullName: string): string | null {
  const first = fullName.trim().split(/\s+/)[0];
  return first || null;
}

export function parseGuestList(input: string, maxPartySize = 1): ParseResult {
  const fileIssues: Issue[] = [];
  const lines = input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    return { guests: [], fileIssues: [{ level: "error", message: "No hay nada que importar." }], headerDetected: false };
  }

  const delimiter = sniffDelimiter(lines.slice(0, 5).join("\n"));

  // Header detection: a first row where at least one cell is a known label and
  // no cell looks like a phone number.
  const firstCells = splitLine(lines[0], delimiter);
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

  const rows = looksLikeHeader ? lines.slice(1) : lines;
  const guests: ParsedGuest[] = [];
  const seen = new Map<string, number>();

  rows.forEach((line, index) => {
    const cells = splitLine(line, delimiter);
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
    const isVip = ["si", "sí", "yes", "x", "1", "true", "vip", "v"].includes(strip(rawVip));

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
      tableNumber,
      isVip,
      issues,
    });
  });

  return { guests, fileIssues, headerDetected: looksLikeHeader };
}

export const hasError = (guest: ParsedGuest) =>
  guest.issues.some((i) => i.level === "error");
