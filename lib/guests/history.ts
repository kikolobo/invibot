import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { guestEvents } from "@/db/schema";

/**
 * Writes down that something happened to a guest.
 *
 * Nothing reads this yet, and that is fine: the moment a guest decides
 * something is the only moment it can be recorded. `guests.rsvpStatus` keeps
 * the latest answer and forgets the previous one, so a history that is not
 * captured as it happens cannot be reconstructed afterwards.
 *
 * Never throws. A missing log line is a gap in analytics; a throw here would
 * be a lost RSVP, and the two are not close in importance.
 */
export async function recordGuestEvent(input: {
  eventId: string;
  guestId: string;
  type: (typeof guestEvents.type.enumValues)[number];
  /** When it happened — the provider's timestamp where there is one, not now(). */
  at: Date;
  source: (typeof guestEvents.source.enumValues)[number];
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(guestEvents).values({
      eventId: input.eventId,
      guestId: input.guestId,
      type: input.type,
      at: input.at,
      source: input.source,
      detail: input.detail ?? {},
    });
  } catch (error) {
    console.error("[history] could not record", input.type, input.guestId, error);
  }
}


/** A guest's timeline, oldest first — the shape you read a history in. */
export function guestHistory(guestId: string) {
  return db
    .select()
    .from(guestEvents)
    .where(eq(guestEvents.guestId, guestId))
    .orderBy(asc(guestEvents.at));
}

/**
 * When something last happened to a guest, or null.
 *
 * "When did they confirm" is the common question, and with a log the honest
 * answer is the most recent confirmation — someone who cancelled and came back
 * confirmed twice, and the second one is the one that counts.
 */
export async function lastGuestEventAt(
  guestId: string,
  type: (typeof guestEvents.type.enumValues)[number],
): Promise<Date | null> {
  const [row] = await db
    .select({ at: guestEvents.at })
    .from(guestEvents)
    .where(and(eq(guestEvents.guestId, guestId), eq(guestEvents.type, type)))
    .orderBy(desc(guestEvents.at))
    .limit(1);
  return row?.at ?? null;
}
