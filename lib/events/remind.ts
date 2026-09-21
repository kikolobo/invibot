import { and, eq, gt, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { conversations, events, guests } from "@/db/schema";
import { formatEventWhen, formatEventWhereForMessage, localDayKey } from "./format";
import { eventReminderReply } from "@/lib/whatsapp/replies";
import { sendTemplateToGuest, sendTextToGuest } from "@/lib/whatsapp/send";
import { buildComponents } from "@/lib/whatsapp/templates";

type GuestRow = typeof guests.$inferSelect;
type EventRow = typeof events.$inferSelect;

/**
 * "Faltan tres días" — the reminder everyone coming gets.
 *
 * The gap this fills: a guest who confirms three weeks out hears nothing until
 * the party. The day-before message does not cover them, by design — it only
 * goes to somebody who still needs their pass — so an early confirmation used
 * to mean silence right up to the door.
 *
 * Free-form when their window happens to be open, because it costs nothing;
 * the approved `recordatorio_evento` template otherwise. Once per guest, ever,
 * and never when the party is tomorrow: that morning belongs to "¡Es mañana!".
 */

/** The day before is spoken for, so a reminder set to 1 (or 0) does not run. */
const MIN_DAYS = 2;

/** As far out as this is still a reminder rather than a second invitation. */
const MAX_DAYS = 30;

/** A margin, so the window cannot close between the check and the send. */
const WINDOW_MARGIN_MS = 15 * 60 * 1000;

export async function remindUpcomingEvents(now = new Date()): Promise<number> {
  const upcoming = await db
    .select()
    .from(events)
    .where(
      and(
        isNull(events.archivedAt),
        gt(events.startsAt, now),
        gte(events.reminderDaysBefore, MIN_DAYS),
        lte(events.reminderDaysBefore, MAX_DAYS),
        lte(events.startsAt, new Date(now.getTime() + (MAX_DAYS + 1) * 86_400_000)),
      ),
    );

  // "Three days before" is a calendar day where the party is, not 72 hours: a
  // party on Saturday night is reminded on Wednesday, whatever o'clock it is.
  const due = upcoming.filter(
    (event) =>
      localDayKey(event.startsAt, event.timezone) ===
      localDayKey(now, event.timezone, event.reminderDaysBefore),
  );
  if (due.length === 0) return 0;

  const byId = new Map(due.map((event) => [event.id, event]));

  const coming = await db
    .select()
    .from(guests)
    .where(
      and(
        inArray(guests.eventId, [...byId.keys()]),
        eq(guests.rsvpStatus, "confirmed"),
        eq(guests.approvalStatus, "approved"),
        eq(guests.optedOut, false),
        isNull(guests.eventRemindedAt),
      ),
    );

  const queue = [...coming];
  let sent = 0;
  const worker = async () => {
    for (let guest = queue.shift(); guest; guest = queue.shift()) {
      try {
        if (await remindGuest(guest, byId.get(guest.eventId)!, now)) sent++;
      } catch (error) {
        console.error("[event] reminder failed", guest.id, error);
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));

  return sent;
}

async function remindGuest(guest: GuestRow, event: EventRow, now: Date): Promise<boolean> {
  const [claimed] = await db
    .update(guests)
    .set({ eventRemindedAt: now, updatedAt: new Date() })
    .where(and(eq(guests.id, guest.id), isNull(guests.eventRemindedAt)))
    .returning({ id: guests.id });
  if (!claimed) return false;

  const name = guest.firstName?.trim() || guest.fullName.split(/\s+/)[0] || guest.fullName;
  const when = formatEventWhen(event);
  // Meta rejects an empty parameter, and an event with no venue yet is legal.
  const where = formatEventWhereForMessage(event) || "Te comparto la ubicación por aquí";

  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.guestId, guest.id), eq(conversations.channel, "whatsapp")),
  });
  const windowOpen =
    conversation?.windowExpiresAt &&
    conversation.windowExpiresAt.getTime() > now.getTime() + WINDOW_MARGIN_MS;

  const outcome = windowOpen
    ? await sendTextToGuest(
        guest.id,
        eventReminderReply({ name, eventName: event.name, when, where }),
        "reminder",
      )
    : await sendTemplateToGuest(
        guest.id,
        {
          name: "recordatorio_evento",
          language: "es_MX",
          components: buildComponents("recordatorio_evento", [name, event.name, when, where]),
        },
        "reminder",
      );

  if (!outcome.ok) {
    // The claim goes back: nothing reached them, and a guest marked as
    // reminded by a send that failed is a guest who is never reminded.
    await db.update(guests).set({ eventRemindedAt: null }).where(eq(guests.id, guest.id));
    console.error("[event] reminder not delivered", guest.id, outcome.reason, outcome.detail);
    return false;
  }

  return true;
}
