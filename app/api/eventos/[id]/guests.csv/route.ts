import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { guests, guestGroups } from "@/db/schema";
import { can, eventAccess } from "@/lib/events/access";
import { inviteLabels } from "@/lib/campaigns/labels";
import { APPROVAL_LABELS, RSVP_LABELS } from "@/lib/guests/import";

/**
 * The guest list as a spreadsheet.
 *
 * Exists because a list people actually work with ends up in Excel or Sheets
 * no matter what the app offers — for seating, for the caterer's headcount,
 * for the one column nobody anticipated.
 *
 * Also the backup: every column the organizer can set is here, under a header
 * the importer recognises, so this file pasted back in rebuilds the list —
 * groups, companions, tables, answers and all. "Invitación" is the exception:
 * it is shown, and ignored on import, because whether a message went out is
 * Meta's to report, not a spreadsheet's.
 */
export const dynamic = "force-dynamic";

/** RFC 4180: quote anything with a comma, quote or newline, and double the quotes. */
function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const access = await eventAccess(id);
  const event = access && can(access, "guests") ? access.event : null;
  if (!event) return new Response("Not found", { status: 404 });

  const rows = await db
    .select({
      fullName: guests.fullName,
      phoneE164: guests.phoneE164,
      email: guests.email,
      groupName: guestGroups.name,
      inviteStatus: guests.inviteStatus,
      rsvpStatus: guests.rsvpStatus,
      partySizeAllowed: guests.partySizeAllowed,
      companions: guests.companions,
      partySizeConfirmed: guests.partySizeConfirmed,
      isVip: guests.isVip,
      tableNumber: guests.tableNumber,
      optedOut: guests.optedOut,
      notes: guests.notes,
      approvalStatus: guests.approvalStatus,
    })
    .from(guests)
    .leftJoin(guestGroups, eq(guests.groupId, guestGroups.id))
    .where(eq(guests.eventId, id))
    .orderBy(asc(guests.fullName));

  const header = [
    "Nombre",
    "Teléfono",
    "Correo",
    "Grupo",
    "Lugares ofrecidos",
    "Acompañante",
    "Mesa",
    "VIP",
    "Notas",
    "Asistencia",
    "Confirmados",
    "Aprobación",
    "Invitación",
    "Baja",
  ];

  const body = rows.map((row) =>
    [
      cell(row.fullName),
      // Leading apostrophe keeps a spreadsheet from eating the "+" and
      // rendering +528118001840 as a number in scientific notation.
      cell(row.phoneE164 ? `'${row.phoneE164}` : ""),
      cell(row.email),
      cell(row.groupName),
      cell(row.partySizeAllowed),
      cell(row.companions[0] ?? ""),
      cell(row.tableNumber),
      cell(row.isVip ? "Sí" : ""),
      cell(row.notes),
      cell(RSVP_LABELS[row.rsvpStatus] ?? row.rsvpStatus),
      cell(row.rsvpStatus === "confirmed" ? (row.partySizeConfirmed ?? 1) : ""),
      cell(APPROVAL_LABELS[row.approvalStatus] ?? row.approvalStatus),
      cell(inviteLabels[row.inviteStatus] ?? row.inviteStatus),
      cell(row.optedOut ? "Sí" : ""),
    ].join(","),
  );

  // CRLF per the spec, and a BOM so Excel reads the accents as UTF-8 instead
  // of turning "Ángela" into "Ãngela".
  const csv = `﻿${[header.join(","), ...body].join("\r\n")}\r\n`;

  const slug = event.slug || "invitados";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="invitados-${slug}.csv"`,
      "cache-control": "no-store",
    },
  });
}
