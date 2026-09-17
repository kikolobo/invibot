import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";

type EventRow = typeof events.$inferSelect;

export const ARCHIVED_MESSAGE =
  "Este evento está archivado. Desarchívalo para poder hacer cambios.";

/**
 * The event, if the caller owns it and is allowed to change it.
 *
 * Archiving has to be enforced here rather than by hiding buttons: a Server
 * Action is a POST endpoint that anyone who has seen the page can call again,
 * and a stale tab left open before archiving would otherwise keep working.
 *
 * Reads are deliberately not routed through this. An archived event stays fully
 * visible — that is the whole difference between archiving and deleting.
 */
export type EventGuard = { ok: true; event: EventRow } | { ok: false; error: string };

export async function editableEvent(eventId: string, orgId: string): Promise<EventGuard> {
  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.orgId, orgId)),
  });

  if (!event) return { ok: false, error: "No encontramos ese evento." };
  if (event.archivedAt) return { ok: false, error: ARCHIVED_MESSAGE };

  return { ok: true, event };
}
