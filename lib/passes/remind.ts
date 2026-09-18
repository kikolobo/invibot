import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { conversations, events, guests } from "@/db/schema";
import {
  formatEventTime,
  formatEventWhereForMessage,
  localDayKey,
} from "@/lib/events/format";
import { sendTemplateToGuest, sendTextToGuest } from "@/lib/whatsapp/send";
import { buildComponents } from "@/lib/whatsapp/templates";
import { dayBeforeReply } from "@/lib/whatsapp/replies";
import { activePasses } from "./issue";
import { sendPasses, PASS_EARLY_MS } from "./send";

type GuestRow = typeof guests.$inferSelect;
type EventRow = typeof events.$inferSelect;

/**
 * The day before: every confirmed guest who does not have their QR yet gets
 * "¡Es mañana!" and a way to collect it.
 *
 * This is where most passes now come from. A confirmation more than
 * `PASS_EARLY_MS` out earns no pass on the spot — sent weeks ahead it is buried
 * by the time anyone looks for it at the door — so this message is both the
 * reminder and the delivery.
 *
 * Two routes, cheapest first. A guest who wrote to us in the last day still has
 * an open window, so they get the same words free-form and the pass right
 * behind them. Everyone else gets the `acceso_evento` template, which cannot
 * carry an image; its button can, because the tap opens a fresh window.
 *
 * Runs from the daily cron only, never from webhook traffic: the cron fires in
 * the morning, and a sweep riding on inbound messages would send "¡Es mañana!"
 * at eleven at night.
 */
export async function remindTomorrowsGuests(now = new Date()): Promise<number> {
  // Narrowed in SQL to the next two days, then to "tomorrow where the party
  // is" here — the calendar day depends on the event's zone, not the server's.
  const upcoming = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.qrEnabled, true),
        isNull(events.archivedAt),
        gt(events.startsAt, now),
        lte(events.startsAt, new Date(now.getTime() + PASS_EARLY_MS)),
      ),
    );

  const tomorrow = upcoming.filter(
    (event) => localDayKey(event.startsAt, event.timezone) === localDayKey(now, event.timezone, 1),
  );
  if (tomorrow.length === 0) return 0;

  const byId = new Map(tomorrow.map((event) => [event.id, event]));

  const candidates = await db
    .select()
    .from(guests)
    .where(
      and(
        inArray(guests.eventId, [...byId.keys()]),
        eq(guests.rsvpStatus, "confirmed"),
        eq(guests.approvalStatus, "approved"),
        eq(guests.optedOut, false),
        isNull(guests.passesRemindedAt),
      ),
    );

  // A few at a time rather than one by one: a wedding is a few hundred guests,
  // each a template call and some a render, and the cron has one run to reach
  // them all — tomorrow the message would be wrong.
  const queue = [...candidates];
  let reminded = 0;
  const worker = async () => {
    for (let guest = queue.shift(); guest; guest = queue.shift()) {
      try {
        if (await remindGuest(guest, byId.get(guest.eventId)!, now)) reminded++;
      } catch (error) {
        console.error("[pass] day-before failed", guest.id, error);
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));

  return reminded;
}

async function remindGuest(guest: GuestRow, event: EventRow, now: Date): Promise<boolean> {
  // Already holding every pass — they confirmed within the last two days and
  // got it behind the card. Nothing to deliver, and a reminder on top of a QR
  // that just arrived is the invasive version of this.
  const passes = await activePasses(guest.id);
  if (passes.length > 0 && passes.every((pass) => pass.sentAt !== null)) return false;

  // Claimed before anything is sent, so an overlapping run — a retried cron, a
  // manual trigger — finds nothing left to claim.
  const [claimed] = await db
    .update(guests)
    .set({ passesRemindedAt: now, updatedAt: new Date() })
    .where(and(eq(guests.id, guest.id), isNull(guests.passesRemindedAt)))
    .returning({ id: guests.id });
  if (!claimed) return false;

  const seats = Math.min(guest.partySizeConfirmed ?? 1, guest.partySizeAllowed);
  const withCompanion = seats >= 2;
  const name = guest.firstName?.trim() || guest.fullName.split(/\s+/)[0] || guest.fullName;
  const time = formatEventTime(event);
  // Meta rejects an empty parameter, and an event with no venue yet is legal.
  const where = formatEventWhereForMessage(event) || "Te comparto la ubicación por aquí";

  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.guestId, guest.id), eq(conversations.channel, "whatsapp")),
  });
  // A margin, because the pass render and upload take a few seconds and the
  // image must land inside the window too.
  const windowOpen =
    conversation?.windowExpiresAt && conversation.windowExpiresAt.getTime() > now.getTime() + 5 * 60 * 1000;

  if (windowOpen) {
    const text = dayBeforeReply({ name, eventName: event.name, time, where }, withCompanion);
    const outcome = await sendTextToGuest(guest.id, text, "reminder");
    if (outcome.ok) {
      await sendPasses(guest);
      return true;
    }
    // The window shut in the moment between checking and sending: the template
    // is still right. Anything else is a real failure and a second attempt as a
    // paid template would most likely fail the same way.
    if (outcome.reason !== "window_closed") {
      console.error("[pass] day-before text failed", guest.id, outcome);
      return false;
    }
  }

  const template = withCompanion ? "acceso_evento_acompanante" : "acceso_evento";
  const outcome = await sendTemplateToGuest(
    guest.id,
    {
      name: template,
      language: "es_MX",
      components: buildComponents(template, [name, event.name, time, where]),
    },
    "reminder",
  );
  if (!outcome.ok) {
    console.error("[pass] day-before template failed", guest.id, outcome);
    return false;
  }
  return true;
}
