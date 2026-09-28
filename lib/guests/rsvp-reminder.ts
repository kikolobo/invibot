import { and, eq, gt, gte, inArray, isNull, lt, notExists, or } from "drizzle-orm";
import { db } from "@/db";
import { conversations, events, guests, sends } from "@/db/schema";
import {
  formatEventWhen,
  formatEventWhereForMessage,
  localHour,
} from "@/lib/events/format";
import { rsvpReminderReply } from "@/lib/whatsapp/replies";
import { sendButtonsToGuest, sendTemplateToGuest } from "@/lib/whatsapp/send";
import { buildComponents, templates } from "@/lib/whatsapp/templates";
import { recordGuestEvent } from "./history";

type GuestRow = typeof guests.$inferSelect;
type EventRow = typeof events.$inferSelect;

/**
 * One nudge to a guest who never answered their invitation — whether they
 * registered themselves or the host added them.
 *
 * Free when it can be: a guest who registered themselves opened a 24-hour
 * window, and inside it the invitation's own buttons cost nothing and need no
 * approval. So the nudge waits for the tail of that window — as late inside it
 * as a decent hour allows. A guest the host added has never written to us, so
 * theirs is always the template, a day after the invitation at the earliest.
 *
 * Once the window has closed it goes out anyway, as the approved
 * `recordatorio_confirmacion` template. That costs money and is the whole
 * reason the free path is tried first, but a guest who never answered is worth
 * asking twice as much as the message costs.
 *
 * Once per guest, ever. `rsvpReminderSentAt` is never cleared: anyone who
 * answers stops being a candidate, and a second nudge to someone who did not is
 * nagging.
 *
 * Swept rather than scheduled, like the passes: driven by the daily cron and
 * opportunistically by inbound webhook traffic.
 */

/**
 * Nobody gets a nudge outside these hours, where the party is: the daily cron's
 * 11:00, give or take three hours. The webhook sweeps too, and without this
 * bound a nudge would land whenever somebody else happened to write.
 */
const DECENT_FROM = 8;
const DECENT_UNTIL = 14;

/**
 * How close to the end of the window counts as "they have had their day".
 *
 * The window is 24 hours, so this is roughly "16 hours later" — long enough
 * that the reminder follows a real silence, and early enough that a free send
 * still fits inside the window with room to spare. Past the end of it the
 * template takes over, which needs no such margin.
 */
const WINDOW_TAIL_MS = 8 * 60 * 60 * 1000;

/** Never right behind something we just sent them. */
const QUIET_AFTER_OUTBOUND_MS = 2 * 60 * 60 * 1000;

/**
 * How long an invitation gets to be answered before it is asked again. Mostly
 * for the guest the host added, whose reminder is not held back by any window:
 * invited at nine, they would otherwise be nudged by the eleven o'clock cron.
 */
const INVITE_SILENCE_MS = 24 * 60 * 60 * 1000;

/** A margin, so the window cannot close between the check and the send. */
const WINDOW_MARGIN_MS = 15 * 60 * 1000;

const INVITED = ["sent", "delivered", "read"] as const;

export async function remindUnansweredRsvps(now = new Date(), limit = 50): Promise<number> {
  const candidates = await db
    .select({
      guest: guests,
      event: events,
      windowExpiresAt: conversations.windowExpiresAt,
      lastInboundAt: conversations.lastInboundAt,
    })
    .from(guests)
    .innerJoin(events, eq(events.id, guests.eventId))
    // Left, not inner: the window is now a choice of route rather than a
    // condition, and a guest with no thread at all still gets the template.
    .leftJoin(
      conversations,
      and(eq(conversations.guestId, guests.id), eq(conversations.channel, "whatsapp")),
    )
    .where(
      and(
        eq(guests.rsvpStatus, "no_response"),
        eq(guests.approvalStatus, "approved"),
        eq(guests.optedOut, false),
        isNull(guests.rsvpReminderSentAt),
        inArray(guests.inviteStatus, [...INVITED]),
        isNull(events.archivedAt),
        gt(events.startsAt, now),
        or(
          isNull(conversations.lastOutboundAt),
          lt(conversations.lastOutboundAt, new Date(now.getTime() - QUIET_AFTER_OUTBOUND_MS)),
        ),
        // An open window has its own wait, below, and the free send inside it
        // is worth keeping; only the template route waits out the invitation.
        or(
          gt(conversations.windowExpiresAt, new Date(now.getTime() + WINDOW_MARGIN_MS)),
          notExists(
            db
              .select({ id: sends.id })
              .from(sends)
              .where(
                and(
                  eq(sends.guestId, guests.id),
                  eq(sends.kind, "invite"),
                  gte(sends.queuedAt, new Date(now.getTime() - INVITE_SILENCE_MS)),
                ),
              ),
          ),
        ),
      ),
    )
    .limit(limit);

  let sent = 0;
  for (const row of candidates) {
    // Only at an hour a person wants to be asked something, whichever route
    // this takes. Checked here rather than in SQL because "decent" is decided
    // in the event's own timezone.
    const hour = localHour(now, row.event.timezone);
    if (hour < DECENT_FROM || hour >= DECENT_UNTIL) continue;

    const remaining = (row.windowExpiresAt?.getTime() ?? 0) - now.getTime();
    const windowOpen = remaining > WINDOW_MARGIN_MS;

    // Inside the window, wait for its tail: the free version is worth a few
    // more hours of patience. Outside it there is nothing left to wait for —
    // the window closed 24 hours after they last wrote, which is the silence
    // this is answering.
    if (windowOpen && remaining > WINDOW_TAIL_MS) continue;

    try {
      if (await remindGuest(row.guest, row.event, now, windowOpen)) sent++;
    } catch (error) {
      console.error("[rsvp] reminder failed", row.guest.id, error);
    }
  }

  return sent;
}

async function remindGuest(
  guest: GuestRow,
  event: EventRow,
  now: Date,
  windowOpen: boolean,
): Promise<boolean> {
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

  const outcome = windowOpen
    ? await sendButtonsToGuest(
        guest.id,
        rsvpReminderReply(
          { name, eventName: event.name, when: formatEventWhen(event) },
          withCompanion,
        ),
        buttons.map((button) => ({ payload: button.payload, label: button.label })),
      )
    : await sendReminderTemplate(guest.id, event, name, withCompanion);

  if (!outcome.ok) {
    // The claim is given back: nothing reached them, and a guest marked as
    // reminded by a send that failed is a guest who never gets asked again.
    // The failures worth retrying are exactly the ones that look permanent
    // here — a template still in review, a window that shut between the check
    // and the send — and both resolve on a later sweep.
    await db
      .update(guests)
      .set({ rsvpReminderSentAt: null })
      .where(eq(guests.id, guest.id));
    console.error("[rsvp] reminder not delivered", guest.id, outcome.reason, outcome.detail);
    return false;
  }

  await recordGuestEvent({
    guestId: guest.id,
    eventId: event.id,
    type: "reminded",
    at: now,
    source: "system",
    detail: { via: windowOpen ? "libre" : "plantilla" },
  });

  return true;
}

/** The paid route: the same question as an approved template. */
function sendReminderTemplate(
  guestId: string,
  event: EventRow,
  name: string,
  withCompanion: boolean,
) {
  const template = withCompanion
    ? "recordatorio_confirmacion_acompanante"
    : "recordatorio_confirmacion";

  return sendTemplateToGuest(
    guestId,
    {
      name: templates[template].name,
      language: templates[template].language,
      components: buildComponents(template, [
        name,
        event.name,
        formatEventWhen(event),
        // Meta rejects an empty parameter, and an event with no venue yet is
        // legal.
        formatEventWhereForMessage(event) || "Te compartimos la ubicación por aquí",
      ]),
    },
    "reminder",
  );
}
