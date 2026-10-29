import { and, count, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { events, guests, organizations, users } from "@/db/schema";

/**
 * How much an account may hold. Two numbers, both set by staff:
 *
 * - events per account, counting the active ones — archiving one frees its
 *   place, since an archived event sends nothing and nobody works on it;
 * - guests per event, from the event's own override when staff set one, or
 *   else from its owner's per-event limit.
 *
 * Null is no limit. The checks live here so every door that adds an event or
 * a guest — the form, a CSV import, a duplicate, a shared contact, a guest
 * registering themselves on WhatsApp — asks the same question.
 */

/** Rejected guests do not hold a place; pending self-registrations do. */
const holdsPlace = ne(guests.approvalStatus, "rejected");

export async function eventLimit(orgId: string) {
  const [row] = await db
    .select({
      max: users.maxEvents,
      used: db.$count(events, and(eq(events.orgId, orgId), isNull(events.archivedAt))),
    })
    .from(organizations)
    .innerJoin(users, eq(users.id, organizations.ownerUserId))
    .where(eq(organizations.id, orgId));
  return { max: row?.max ?? null, used: row?.used ?? 0 };
}

/** Null when there is room for `adding` more events, else the message to show. */
export async function eventLimitError(orgId: string, adding = 1): Promise<string | null> {
  const { max, used } = await eventLimit(orgId);
  if (max === null || used + adding <= max) return null;
  return max === 0
    ? "Tu cuenta todavía no puede crear eventos. Escríbenos para activarla."
    : `Tu cuenta permite ${max} ${max === 1 ? "evento activo" : "eventos activos"} y ya tienes ${used}. Archiva uno o escríbenos para ampliar el límite.`;
}

export async function guestLimit(eventId: string) {
  const [row] = await db
    .select({
      eventMax: events.maxGuests,
      ownerMax: users.maxGuestsPerEvent,
    })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.orgId))
    .innerJoin(users, eq(users.id, organizations.ownerUserId))
    .where(eq(events.id, eventId));

  const [{ used }] = await db
    .select({ used: count() })
    .from(guests)
    .where(and(eq(guests.eventId, eventId), holdsPlace));

  const max = row ? (row.eventMax ?? row.ownerMax) : null;
  return { max, used, remaining: max === null ? Infinity : Math.max(0, max - used) };
}

/** Null when `adding` more guests fit, else the message to show the organizer. */
export async function guestLimitError(eventId: string, adding = 1): Promise<string | null> {
  const { max, used, remaining } = await guestLimit(eventId);
  if (adding <= remaining) return null;
  if (remaining === 0) {
    return `Este evento llegó a su límite de ${max} invitados. Escríbenos si necesitas más lugares.`;
  }
  return `Este evento permite ${max} invitados y ya tiene ${used}: caben ${remaining} más, no ${adding}.`;
}
