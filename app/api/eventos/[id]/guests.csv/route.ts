import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, guests, guestGroups } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { inviteLabels } from "@/lib/campaigns/labels";

/**
 * The guest list as a spreadsheet.
 *
 * Exists because a list people actually work with ends up in Excel or Sheets
 * no matter what the app offers — for seating, for the caterer's headcount,
 * for the one column nobody anticipated.
 */
export const dynamic = "force-dynamic";

const rsvpLabels: Record<string, string> = {
  no_response: "Sin responder",
  confirmed: "Confirmado",
  declined: "No podrá",
  maybe: "Tal vez",
  waitlist: "Lista de espera",
};

/** RFC 4180: quote anything with a comma, quote or newline, and double the quotes. */
function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.orgId, orgId)),
  });
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
      partySizeConfirmed: guests.partySizeConfirmed,
      optedOut: guests.optedOut,
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
    "Invitación",
    "Asistencia",
    "Lugares ofrecidos",
    "Confirmados",
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
      cell(inviteLabels[row.inviteStatus] ?? row.inviteStatus),
      cell(rsvpLabels[row.rsvpStatus] ?? row.rsvpStatus),
      cell(row.partySizeAllowed),
      cell(row.rsvpStatus === "confirmed" ? (row.partySizeConfirmed ?? 1) : ""),
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
