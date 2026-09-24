"use server";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, guestEvents, guests, messages, sends } from "@/db/schema";
import { can, eventAccess } from "@/lib/events/access";
import { buildTimeline, type TimelineEntry } from "./timeline-assemble";

/**
 * Everything that ever happened to one guest, in one list.
 *
 * Assembled rather than stored: the facts already live in three places that
 * each exist for their own reason — `guest_events` for the milestones with
 * WhatsApp's own timestamps, `sends` for what each message was, and `messages`
 * for what was actually said. A fourth table holding a copy would be a fourth
 * thing to keep in step.
 *
 * This half is the reading; `timeline-assemble.ts` is the shaping.
 */
export async function guestTimeline(
  eventId: string,
  guestId: string,
): Promise<{ entries: TimelineEntry[]; error?: string }> {
  // Ownership is checked against the event, not the guest: a guest id is
  // guessable and this is somebody's phone number and everything they said.
  const access = await eventAccess(eventId);
  const event = access && can(access, "guests") ? access.event : null;
  if (!event) return { entries: [], error: "No encontramos ese evento." };

  const guest = await db.query.guests.findFirst({
    where: and(eq(guests.id, guestId), eq(guests.eventId, eventId)),
  });
  if (!guest) return { entries: [], error: "No encontramos a esa persona." };

  const history = await db
    .select()
    .from(guestEvents)
    .where(eq(guestEvents.guestId, guestId))
    .orderBy(asc(guestEvents.at));

  const thread = await db
    .select({
      direction: messages.direction,
      body: messages.body,
      createdAt: messages.createdAt,
      kind: sends.kind,
      templateName: sends.templateName,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    // What each outbound message actually was. Left, because an inbound
    // message has no send and an old one may predate the ledger.
    .leftJoin(sends, eq(sends.providerMessageId, messages.providerMessageId))
    .where(and(eq(conversations.guestId, guestId), eq(conversations.channel, "whatsapp")))
    .orderBy(asc(messages.createdAt));

  return { entries: buildTimeline(history, thread) };
}
