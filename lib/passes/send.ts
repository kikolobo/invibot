import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events, guests } from "@/db/schema";
import { configFromEnv, uploadMedia } from "@/lib/whatsapp/client";
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
export async function sendPasses(guest: GuestRow): Promise<void> {
  const pending = await syncPasses(guest);
  if (pending.length === 0) return;

  const config = configFromEnv();
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

      const outcome = await sendImageToGuest(guest.id, uploaded.mediaId, "logistics", caption);
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
