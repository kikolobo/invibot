import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { events, guests } from "@/db/schema";
import { whatsappConfig, uploadMedia, type WhatsAppConfig } from "@/lib/whatsapp/client";
import { sendImageToGuest } from "@/lib/whatsapp/send";
import { syncPasses, markPassSent } from "./issue";
import { renderPass } from "./render";

type GuestRow = typeof guests.$inferSelect;

/**
 * Sends a confirmed guest their QR — one per person coming.
 *
 * Nothing is stored: a pass is rendered from its code on the way out, so there
 * is no bucket to keep in step with the database and a revoked pass cannot be
 * served from a stale file. Rendering costs milliseconds.
 *
 * Silent on every failure. The guest already has their confirmation and their
 * invitation; a missing pass is worth a log line and a retry, not a message
 * telling them something went wrong with something they never asked for.
 */
export async function sendPasses(guest: GuestRow, account?: WhatsAppConfig): Promise<void> {
  const pending = await syncPasses(guest);
  if (pending.length === 0) return;

  // The upload and the send must be the same number: a media id is minted for
  // one phone number and rejected by any other.
  const config = account ?? whatsappConfig();
  if (!config) return;

  const event = await db.query.events.findFirst({ where: eq(events.id, guest.eventId) });
  if (!event) return;

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
    } catch (error) {
      console.error("[pass] could not issue", pass.id, error);
    }
  }
}

/**
 * How long a pass waits behind the invitation card.
 *
 * The card is the message the guest was waiting for. A QR arriving in the same
 * breath buries it, and reads like a ticketing system rather than an
 * invitation. Forty-five minutes is long enough that they have looked at the
 * card and short enough to stay far inside the 24-hour window their own
 * confirmation opened — which matters because a pass is a free-form image, and
 * outside that window there is no template that can carry one.
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
 * Sends the passes, or decides when to.
 *
 * Returns true when they went out immediately, which is only the case for a
 * guest confirming close to the event.
 */
export async function deliverOrSchedulePasses(
  guest: GuestRow,
  event: { startsAt: Date },
  account?: WhatsAppConfig,
): Promise<boolean> {
  const untilEvent = event.startsAt.getTime() - Date.now();

  if (untilEvent <= PASS_URGENT_MS) {
    await sendPasses(guest, account);
    return true;
  }

  await db
    .update(guests)
    .set({ passesDueAt: new Date(Date.now() + PASS_DELAY_MS), updatedAt: new Date() })
    .where(eq(guests.id, guest.id));

  return false;
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
