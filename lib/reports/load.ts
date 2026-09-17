import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, guests, guestGroups } from "@/db/schema";
import {
  applyFilter,
  buildSections,
  filters,
  isFilter,
  isOrder,
  seatsOf,
  summarize,
  type Direction,
  type FilterKey,
  type OrderKey,
} from "./guest-report";

/**
 * Turns a query string into a sheet.
 *
 * Shared by the page and the print view so both read the same URL the same
 * way — the print view is literally the same report, minus the furniture.
 */
export type ReportQuery = Record<string, string | string[] | undefined>;

export function readShape(query: ReportQuery) {
  const rawFilter = String(query.filtro ?? "confirmados");
  const rawOrder = String(query.orden ?? "nombre");
  return {
    filter: (isFilter(rawFilter) ? rawFilter : "confirmados") as FilterKey,
    order: (isOrder(rawOrder) ? rawOrder : "nombre") as OrderKey,
    direction: (query.dir === "desc" ? "desc" : "asc") as Direction,
    grouped: query.agrupar === "1",
  };
}

export async function loadReport(eventId: string, orgId: string, query: ReportQuery) {
  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.orgId, orgId)),
  });
  if (!event) return null;

  const shape = readShape(query);

  const rows = await db
    .select({
      id: guests.id,
      fullName: guests.fullName,
      firstName: guests.firstName,
      groupName: guestGroups.name,
      rsvpStatus: guests.rsvpStatus,
      inviteStatus: guests.inviteStatus,
      partySizeConfirmed: guests.partySizeConfirmed,
      partySizeAllowed: guests.partySizeAllowed,
    })
    .from(guests)
    .leftJoin(guestGroups, eq(guests.groupId, guestGroups.id))
    .where(eq(guests.eventId, eventId));

  const selected = applyFilter(rows, shape.filter);

  return {
    event,
    shape,
    // Over the whole list, not the filtered view: it is the state of the
    // event, and it should not change when you click a filter.
    summary: summarize(rows),
    sections: buildSections(selected, shape),
    total: selected.length,
    seats: selected.reduce((sum, guest) => sum + seatsOf(guest), 0),
    filterLabel: filters[shape.filter],
  };
}
