import { and, eq, ne } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { events, organizers } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";

type EventRow = typeof events.$inferSelect;

/**
 * Who the signed-in person is on one event.
 *
 * `owner` comes from the event belonging to their organization. The other two
 * are accounts the owner invited, recorded on their organizer row — invited
 * people keep their own organization, so ownership alone can no longer answer
 * "may this person see this event".
 */
export type EventRole = "owner" | "admin" | "guest_manager";

/**
 * What a page or action needs, rather than which roles may call it. Adding a
 * role then means deciding its row in `grants` below, not revisiting every
 * call site.
 *
 * - `event`  — generales, detalles, the card, learned answers, archiving,
 *              the simulator: anything that changes what the event *is*.
 * - `guests` — the guest list, approvals, invitations, reports.
 * - `answer` — the guests' open questions.
 * - `team`   — the organizer list, and inviting people into the event.
 */
export type Capability = "event" | "guests" | "answer" | "team";

export type EventAccess = {
  event: EventRow;
  role: EventRole;
  /** Whether this person is the one guests' questions go to. */
  isResponder: boolean;
};

export function can(access: Pick<EventAccess, "role" | "isResponder">, need: Capability) {
  switch (access.role) {
    case "owner":
    case "admin":
      return true;
    case "guest_manager":
      // Answering is tied to being the responder rather than to the role: the
      // one person guests' questions go to must be able to answer them, and
      // nobody else on this role needs to.
      return need === "guests" || (need === "answer" && access.isResponder);
  }
}

/** The caller's access to this event, or null when they have none at all. */
export async function eventAccess(eventId: string): Promise<EventAccess | null> {
  const { orgId, userId } = await requireOrg();

  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) return null;

  if (event.orgId === orgId) {
    const own = await db.query.organizers.findFirst({
      where: and(eq(organizers.eventId, eventId), eq(organizers.isOwner, true)),
      columns: { isResponder: true },
    });
    return { event, role: "owner", isResponder: own?.isResponder ?? false };
  }

  const seat = await db.query.organizers.findFirst({
    where: and(
      eq(organizers.eventId, eventId),
      eq(organizers.userId, userId),
      ne(organizers.role, "organizer"),
    ),
    columns: { role: true, isResponder: true },
  });
  if (!seat || seat.role === "organizer") return null;

  return { event, role: seat.role, isResponder: seat.isResponder };
}

/**
 * For pages. No access at all is a 404 — an event you were not invited to
 * does not exist as far as you can tell. Access without this capability goes
 * to the guest list, which every role can open.
 */
export async function requireEventAccess(
  eventId: string,
  need: Capability,
): Promise<EventAccess> {
  const access = await eventAccess(eventId);
  if (!access) notFound();
  if (!can(access, need)) redirect(`/eventos/${eventId}/invitados`);
  return access;
}

/**
 * The events this account was invited into, for the lists. Their own events
 * are read by organization as before; these are the ones that are not.
 */
export async function sharedEvents(): Promise<{ event: EventRow; role: EventRole }[]> {
  const { orgId, userId } = await requireOrg();

  const rows = await db
    .select({ event: events, role: organizers.role })
    .from(organizers)
    .innerJoin(events, eq(events.id, organizers.eventId))
    .where(and(eq(organizers.userId, userId), ne(organizers.role, "organizer")));

  return rows.flatMap(({ event, role }) =>
    role === "organizer" || event.orgId === orgId ? [] : [{ event, role }],
  );
}

export const roleLabels: Record<Exclude<EventRole, "owner">, string> = {
  admin: "Admin",
  guest_manager: "Gestor de invitados",
};
