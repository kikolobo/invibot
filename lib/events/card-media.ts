import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { r2FromEnv, getObject } from "@/lib/storage/r2";
import { whatsappConfig, uploadMedia, type WhatsAppConfig } from "@/lib/whatsapp/client";

type EventRow = typeof events.$inferSelect;

/**
 * Meta documents media handles as expiring around 30 days. Refreshing at 25
 * leaves room for a campaign that runs over the boundary rather than finding
 * out from a failed send to a guest who just confirmed.
 */
const REFRESH_AFTER_MS = 25 * 24 * 60 * 60 * 1000;

/**
 * The media handle for this event's card, uploading it to Meta if there isn't a
 * usable one.
 *
 * Returns null whenever the card simply cannot be sent — no card uploaded, no
 * storage configured, upload rejected. Every caller treats that as "send the
 * text and move on", because a missing card is never a reason to withhold a
 * guest's confirmation.
 *
 * `config` is the number that will send it, and it is part of the cache key:
 * a handle uploaded by one number is rejected by the other, and there is only
 * one cached handle per event.
 */
export async function resolveCardMediaId(
  event: EventRow,
  config?: WhatsAppConfig,
): Promise<string | null> {
  if (!event.cardR2Key) return null;

  const whatsapp = config ?? whatsappConfig();

  // Stale means expiring *or* belonging to the other number. The second case is
  // what makes this worth a column: an unusable handle looks exactly like a
  // usable one, and the only symptom is a card that never arrives.
  const fresh =
    event.cardMediaId &&
    event.cardMediaRefreshedAt &&
    Date.now() - event.cardMediaRefreshedAt.getTime() < REFRESH_AFTER_MS &&
    event.cardMediaPhoneNumberId === (whatsapp?.phoneNumberId ?? null);
  if (fresh) return event.cardMediaId;

  const r2 = r2FromEnv();
  if (!r2 || !whatsapp) return event.cardMediaId ?? null;

  let bytes: ArrayBuffer | null;
  try {
    bytes = await getObject(r2, event.cardR2Key);
  } catch (error) {
    console.error("[card] could not read from R2", event.id, error);
    // An expired handle is still better than nothing; a fresh one is impossible.
    // A handle from the *other* number is worse than nothing, though — it can
    // only fail — so that case gives up cleanly.
    return staleFallback(event, whatsapp);
  }
  if (!bytes) {
    console.error("[card] r2 key points at nothing", event.id, event.cardR2Key);
    return staleFallback(event, whatsapp);
  }

  const uploaded = await uploadMedia(
    whatsapp,
    bytes,
    event.cardContentType ?? "image/jpeg",
    `invitacion-${event.slug}`,
  );
  if (!uploaded.ok) {
    console.error("[card] media upload failed", event.id, uploaded.title, uploaded.detail);
    return staleFallback(event, whatsapp);
  }

  await db
    .update(events)
    .set({
      cardMediaId: uploaded.mediaId,
      cardMediaRefreshedAt: new Date(),
      cardMediaPhoneNumberId: whatsapp.phoneNumberId,
    })
    .where(eq(events.id, event.id));

  return uploaded.mediaId;
}

/**
 * The cached handle, but only if this number is the one that made it.
 *
 * A handle from the other number is not a degraded option, it is a guaranteed
 * failure — and one that costs a send attempt to discover.
 */
function staleFallback(event: EventRow, config: WhatsAppConfig | null): string | null {
  if (!event.cardMediaId) return null;
  if (!config) return event.cardMediaId;
  return event.cardMediaPhoneNumberId === config.phoneNumberId ? event.cardMediaId : null;
}
