import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { events, guests } from "@/db/schema";
import { whatsappConfig, uploadMedia, type WhatsAppConfig } from "@/lib/whatsapp/client";
import { sendImageToGuest } from "@/lib/whatsapp/send";
import { syncPasses, markPassSent, activePasses } from "./issue";
import { renderPass } from "./render";

type GuestRow = typeof guests.$inferSelect;

/**
 * Sends a confirmed guest their QR — one per person coming.
 *
 * Nothing is stored: a pass is rendered from its code on the way out, so there
 * is no bucket to keep in step with the database and a revoked pass cannot be
 * served from a stale file. Rendering costs milliseconds.
 *
 * `again` sends every active pass rather than only the ones not yet delivered —
 * a guest asking for theirs a second time gets the same codes, never new ones,
 * so the screenshot they already have keeps working.
 *
 * Silent on every failure. The guest already has their confirmation and their
 * invitation; a missing pass is worth a log line and a retry, not a message
 * telling them something went wrong with something they never asked for.
 * Returns how many actually left, for the callers that have to say so.
 */
export async function sendPasses(
  guest: GuestRow,
  account?: WhatsAppConfig,
  options: { again?: boolean } = {},
): Promise<number> {
  const unsent = await syncPasses(guest);
  const pending = options.again ? await activePasses(guest.id) : unsent;
  if (pending.length === 0) return 0;

  // The upload and the send must be the same number: a media id is minted for
  // one phone number and rejected by any other.
  const config = account ?? whatsappConfig();
  if (!config) return 0;

  const event = await db.query.events.findFirst({ where: eq(events.id, guest.eventId) });
  if (!event) return 0;

  let sent = 0;
  for (const pass of pending) {
    try {
      const png = await renderPass({
        code: pass.code,
        label: pass.label,
        eventName: event.name,
      });

      const uploaded = await uploadMedia(config, png.buffer as ArrayBuffer, "image/png", "acceso");
      if (!uploaded.ok) {
        console.error("[pass] upload failed", pass.id, uploaded.title);
        continue;
      }

      const caption =
        pass.seat === 1
          ? `Este es tu acceso para ${event.name}. Muéstralo en la entrada.`
          : "Y este es el de tu acompañante.";

      const outcome = await sendImageToGuest(guest.id, uploaded.mediaId, "logistics", caption, config);
      if (!outcome.ok) {
        console.error("[pass] send failed", pass.id, outcome.reason);
        continue;
      }

      // Only after it actually left, so a failure halfway through two passes
      // resends the one that did not arrive rather than both.
      await markPassSent(pass.id);
      sent++;
    } catch (error) {
      console.error("[pass] could not issue", pass.id, error);
    }
  }
  return sent;
}

/**
 * How long a pass waits behind the invitation card.
 *
 * The card is the message the guest was waiting for. A QR arriving in the same
 * breath buries it, and reads like a ticketing system rather than an
 * invitation. Forty-five minutes is long enough that they have looked at the
 * card and short enough to stay far inside the 24-hour window their own
 * confirmation opened — which matters because a pass is a free-form image.
 */
const PASS_DELAY_MS = 45 * 60 * 1000;

/**
 * How close to the party is too close to wait.
 *
 * Someone confirming two hours before the doors open needs the code on their
 * phone now, not while they are parking. Inside this, the delay is skipped
 * entirely.
 */
const PASS_URGENT_MS = 2 * 60 * 60 * 1000;

/**
 * How close to the party a confirmation earns its pass on the spot.
 *
 * Further out than this, the pass waits for the day-before message
 * (`remindTomorrowsGuests`): a QR sent weeks ahead is buried under a month of
 * chat by the time anyone looks for it at the door, and the day-before message
 * puts it at the top. Inside it the day-before sweep has already run, or is
 * about to find the pass delivered, so it goes out behind the card as before.
 *
 * Forty-eight hours because the sweep runs once a day, the morning before: an
 * event "tomorrow" is never more than about 38 hours away when it runs, so
 * nobody who confirms falls between the two.
 */
export const PASS_EARLY_MS = 48 * 60 * 60 * 1000;

/**
 * When a pass stops being worth sending. `endsAt` when the organizer gave one,
 * otherwise a generous evening — a guest arriving late still needs the code.
 */
const DEFAULT_EVENT_LENGTH_MS = 12 * 60 * 60 * 1000;

type EventTiming = { startsAt: Date; endsAt: Date | null };

const isOver = (event: EventTiming, now = Date.now()) =>
  now > (event.endsAt?.getTime() ?? event.startsAt.getTime() + DEFAULT_EVENT_LENGTH_MS);

/**
 * Sends the passes, or decides when to.
 *
 * Returns true when they went out immediately, which is only the case for a
 * guest confirming close to the event. A guest confirming further out than
 * `PASS_EARLY_MS` gets nothing now: the day-before message carries theirs.
 */
export async function deliverOrSchedulePasses(
  guest: GuestRow,
  event: EventTiming,
  account?: WhatsAppConfig,
): Promise<boolean> {
  const untilEvent = event.startsAt.getTime() - Date.now();

  if (untilEvent <= PASS_URGENT_MS) {
    await sendPasses(guest, account);
    return true;
  }

  if (untilEvent > PASS_EARLY_MS) return false;

  await db
    .update(guests)
    .set({ passesDueAt: new Date(Date.now() + PASS_DELAY_MS), updatedAt: new Date() })
    .where(eq(guests.id, guest.id));

  return false;
}

export type PassRequestOutcome =
  | { ok: true; sent: number }
  | {
      ok: false;
      reason: "disabled" | "not_confirmed" | "too_early" | "over" | "failed";
    };

/**
 * A guest asking for their passes — the day-before button, or in words.
 *
 * Honoured whenever they are entitled to them: they are coming, the party has
 * not ended, and either the passes already reached them once or it is close
 * enough that they would have. Asking three weeks out is "too early" rather
 * than a way around the day-before delivery; the caller tells them when.
 *
 * Re-reads the guest: the assistant may have confirmed them a moment ago, in
 * the same turn, and the row it was handed predates that.
 */
export async function requestPasses(
  guestId: string,
  account?: WhatsAppConfig,
): Promise<PassRequestOutcome> {
  const guest = await db.query.guests.findFirst({ where: eq(guests.id, guestId) });
  if (!guest) return { ok: false, reason: "failed" };

  const event = await db.query.events.findFirst({ where: eq(events.id, guest.eventId) });
  if (!event?.qrEnabled) return { ok: false, reason: "disabled" };
  if (guest.rsvpStatus !== "confirmed" || guest.optedOut) {
    return { ok: false, reason: "not_confirmed" };
  }
  if (isOver(event)) return { ok: false, reason: "over" };

  const delivered = (await activePasses(guest.id)).some((pass) => pass.sentAt !== null);
  const untilEvent = event.startsAt.getTime() - Date.now();
  if (!delivered && untilEvent > PASS_EARLY_MS) return { ok: false, reason: "too_early" };

  const sent = await sendPasses(guest, account, { again: true });
  return sent > 0 ? { ok: true, sent } : { ok: false, reason: "failed" };
}

/**
 * Sends every pass whose wait is over.
 *
 * Swept rather than scheduled, because there is nothing here to schedule with:
 * Inngest is still a plan, and a serverless function cannot hold a timer for
 * forty-five minutes. So the due time is a column and this drains it, driven
 * both by a cron and opportunistically by inbound webhook traffic — the second
 * is what makes it work on a plan whose cron only runs once a day.
 *
 * Safe to run concurrently with itself: `passesDueAt` is cleared before
 * anything is sent, and an individual pass is marked sent only once it has
 * actually left.
 */
export async function sendDuePasses(limit = 25): Promise<number> {
  const due = await db
    .select()
    .from(guests)
    .where(and(isNotNull(guests.passesDueAt), lte(guests.passesDueAt, new Date())))
    .limit(limit);

  if (due.length === 0) return 0;

  // Cleared first. A second sweep overlapping this one would otherwise pick up
  // the same guests and send everything twice — and a guest who gets two
  // identical QR codes has no way to know which one the door will accept.
  await db
    .update(guests)
    .set({ passesDueAt: null, updatedAt: new Date() })
    .where(
      inArray(
        guests.id,
        due.map((row) => row.id),
      ),
    );

  let sent = 0;
  for (const guest of due) {
    try {
      await sendPasses(guest);
      sent++;
    } catch (error) {
      console.error("[pass] sweep failed", guest.id, error);
    }
  }
  return sent;
}
