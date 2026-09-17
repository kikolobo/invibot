import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { r2FromEnv, getObject } from "@/lib/storage/r2";
import { configFromEnv, uploadMedia } from "@/lib/whatsapp/client";

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
 */
export async function resolveCardMediaId(event: EventRow): Promise<string | null> {
  if (!event.cardR2Key) return null;

  const fresh =
    event.cardMediaId &&
    event.cardMediaRefreshedAt &&
    Date.now() - event.cardMediaRefreshedAt.getTime() < REFRESH_AFTER_MS;
  if (fresh) return event.cardMediaId;

  const r2 = r2FromEnv();
  const whatsapp = configFromEnv();
  if (!r2 || !whatsapp) return event.cardMediaId ?? null;

  let bytes: ArrayBuffer | null;
  try {
    bytes = await getObject(r2, event.cardR2Key);
  } catch (error) {
    console.error("[card] could not read from R2", event.id, error);
    // An expired handle is still better than nothing; a fresh one is impossible.
    return event.cardMediaId ?? null;
  }
  if (!bytes) {
    console.error("[card] r2 key points at nothing", event.id, event.cardR2Key);
    return event.cardMediaId ?? null;
  }

  const uploaded = await uploadMedia(
    whatsapp,
    bytes,
    event.cardContentType ?? "image/jpeg",
    `invitacion-${event.slug}`,
  );
  if (!uploaded.ok) {
    console.error("[card] media upload failed", event.id, uploaded.title, uploaded.detail);
    return event.cardMediaId ?? null;
  }

  await db
    .update(events)
    .set({ cardMediaId: uploaded.mediaId, cardMediaRefreshedAt: new Date() })
    .where(eq(events.id, event.id));

  return uploaded.mediaId;
}
