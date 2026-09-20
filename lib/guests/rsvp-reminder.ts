import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { conversations, events, guests } from "@/db/schema";
import { formatEventWhen, localHour } from "@/lib/events/format";
import { rsvpReminderReply } from "@/lib/whatsapp/replies";
import { sendButtonsToGuest } from "@/lib/whatsapp/send";
import { templates } from "@/lib/whatsapp/templates";

type GuestRow = typeof guests.$inferSelect;
type EventRow = typeof events.$inferSelect;

/**
 * One nudge to a self-registered guest who never answered their invitation.
 *
 * Worth doing because of an accident of timing: registering themselves opened a
 * 24-hour window, and inside it the invitation's own buttons cost nothing and
 * need no approval. Outside it the same message is a paid template, which is
 * why this chases the window rather than the clock — it goes as late inside the
 * window as a decent hour allows, and if there is no decent hour left it is not
 * sent at all. A nudge is worth less than a guest's opinion of us.
 *
 * Once per guest, ever. `rsvpReminderSentAt` is never cleared: anyone who
 * answers stops being a candidate, and a second nudge to someone who did not is
 * nagging.
 *
 * Swept rather than scheduled, like the passes: driven by the daily cron and
 * opportunistically by inbound webhook traffic.
 */

/** Nobody gets a nudge outside these hours, where the party is. */
const DECENT_FROM = 11;
const DECENT_UNTIL = 20;

/**
 * How close to the end of the window counts as "they have had their day".
 *
 * The window is 24 hours, so this is roughly "16 hours later" — long enough
 * that the reminder follows a real silence, and early enough that a send still
 * fits inside the window with room to spare.
 */
const WINDOW_TAIL_MS = 8 * 60 * 60 * 1000;

/** Never right behind something we just sent them. */
const QUIET_AFTER_OUTBOUND_MS = 2 * 60 * 60 * 1000;

/** A margin, so the window cannot close between the check and the send. */
const WINDOW_MARGIN_MS = 15 * 60 * 1000;

const INVITED = ["sent", "delivered", "read"] as const;

export async function remindUnansweredRsvps(now = new Date(), limit = 50): Promise<number> {
  const candidates = await db
    .select({ guest: guests, event: events, windowExpiresAt: conversations.windowExpiresAt })
    .from(guests)
    .innerJoin(events, eq(events.id, guests.eventId))
    .innerJoin(
      conversations,
      and(eq(conversations.guestId, guests.id), eq(conversations.channel, "whatsapp")),
    )
    .where(
      and(
        // Only the people this is about: they wrote to us to get here, so the
        // window exists at all. A guest the host typed in has never messaged
        // us and could only be reminded by a paid template.
        eq(guests.source, "self"),
        eq(guests.rsvpStatus, "no_response"),
        eq(guests.approvalStatus, "approved"),
        eq(guests.optedOut, false),
        isNull(guests.rsvpReminderSentAt),
        inArray(guests.inviteStatus, [...INVITED]),
        isNull(events.archivedAt),
        gt(events.startsAt, now),
        gt(conversations.windowExpiresAt, new Date(now.getTime() + WINDOW_MARGIN_MS)),
        or(
          isNull(conversations.lastOutboundAt),
          lt(conversations.lastOutboundAt, new Date(now.getTime() - QUIET_AFTER_OUTBOUND_MS)),
        ),
      ),
    )
    .limit(limit);

  let sent = 0;
  for (const row of candidates) {
    if (!row.windowExpiresAt) continue;
    // Late in the window, and only at an hour a person wants to be asked
    // something. Both have to hold at the same moment, which is why this is
    // swept often rather than scheduled once.
    if (row.windowExpiresAt.getTime() - now.getTime() > WINDOW_TAIL_MS) continue;

    const hour = localHour(now, row.event.timezone);
    if (hour < DECENT_FROM || hour >= DECENT_UNTIL) continue;

    try {
      if (await remindGuest(row.guest, row.event, now)) sent++;
    } catch (error) {
      console.error("[rsvp] reminder failed", row.guest.id, error);
    }
  }

  return sent;
}

async function remindGuest(guest: GuestRow, event: EventRow, now: Date): Promise<boolean> {
  // Claimed before sending, so two overlapping sweeps cannot both nudge.
  const [claimed] = await db
    .update(guests)
    .set({ rsvpReminderSentAt: now, updatedAt: new Date() })
    .where(and(eq(guests.id, guest.id), isNull(guests.rsvpReminderSentAt)))
    .returning({ id: guests.id });
  if (!claimed) return false;

  const name = guest.firstName?.trim() || guest.fullName.split(/\s+/)[0] || guest.fullName;
  const withCompanion = guest.partySizeAllowed >= 2;

  // The invitation's own payloads, so a tap here lands in `parseIntent` exactly
  // as a tap on the template does — same intent, same seats, same reply.
  const buttons = withCompanion
    ? [
        templates.invitacion_evento_acompanante.buttons[0],
        templates.invitacion_evento_acompanante.buttons[1],
        templates.invitacion_evento_acompanante.buttons[2],
      ]
    : [templates.invitacion_evento.buttons[0], templates.invitacion_evento.buttons[1]];

  const body = rsvpReminderReply(
    { name, eventName: event.name, when: formatEventWhen(event) },
    withCompanion,
  );

  const outcome = await sendButtonsToGuest(
    guest.id,
    body,
    buttons.map((button) => ({ payload: button.payload, label: button.label })),
  );

  if (!outcome.ok) {
    // Left claimed on purpose when the window shut under us: it will not
    // reopen without the guest writing, and that message is a better answer
    // than this reminder anyway.
    console.error("[rsvp] reminder not delivered", guest.id, outcome.reason, outcome.detail);
    return false;
  }

  // No row in the guest's history: `guest_event_type` has no "reminded" and
  // widening a Postgres enum is a migration of its own for a line nobody reads.
  // The `sends` ledger already holds it, kind `reminder`, like every other
  // message.
  return true;
}
