import { events } from "@/db/schema";
import { can, eventAccess, type Capability, type EventAccess } from "./access";

type EventRow = typeof events.$inferSelect;

export const ARCHIVED_MESSAGE =
  "Este evento está archivado. Desarchívalo para poder hacer cambios.";

/**
 * The event, if the caller may do this kind of thing to it and it can still
 * be changed.
 *
 * Archiving and permissions both have to be enforced here rather than by
 * hiding buttons: a Server Action is a POST endpoint that anyone who has seen
 * the page can call again, and a stale tab left open before archiving — or
 * before somebody's role changed — would otherwise keep working.
 *
 * Reads are deliberately not routed through this. An archived event stays fully
 * visible — that is the whole difference between archiving and deleting.
 */
export type EventGuard =
  | { ok: true; event: EventRow; access: EventAccess }
  | { ok: false; error: string };

export async function editableEvent(eventId: string, need: Capability): Promise<EventGuard> {
  const access = await eventAccess(eventId);

  if (!access) return { ok: false, error: "No encontramos ese evento." };
  if (!can(access, need)) {
    return { ok: false, error: "Tu acceso a este evento no incluye esto." };
  }
  if (access.event.archivedAt) return { ok: false, error: ARCHIVED_MESSAGE };

  return { ok: true, event: access.event, access };
}
