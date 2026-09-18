"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { events } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import sharp from "sharp";
import { r2FromEnv, putObject, deleteObject } from "@/lib/storage/r2";
import type { ActionState } from "./actions";
import { editableEvent } from "./guard";

/**
 * The invitation card an organizer uploads, and which every guest receives the
 * moment they confirm.
 */

/** What WhatsApp will actually render. Anything else is rejected at the door. */
const ALLOWED = new Set(["image/jpeg", "image/png"]);

/** Meta's ceiling for an image is 5 MB. Refusing here is clearer than a failed send. */
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadCard(
  eventId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { ok?: string }> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };
  const event = guard.event;

  const file = formData.get("card");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige una imagen." };

  if (!ALLOWED.has(file.type)) {
    return { error: "La imagen tiene que ser JPG o PNG." };
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return { error: `La imagen pesa ${mb} MB y el máximo de WhatsApp son 5 MB.` };
  }

  const r2 = r2FromEnv();
  if (!r2) return { error: "El almacenamiento de imágenes todavía no está configurado." };

  // Keyed by upload rather than by event, so replacing a card cannot be served
  // stale from a cache that still has the old bytes under the same name.
  const extension = file.type === "image/png" ? "png" : "jpg";
  const key = `cards/${eventId}/${Date.now()}.${extension}`;

  try {
    await putObject(r2, key, await file.arrayBuffer(), file.type);
  } catch (error) {
    console.error("[card] upload failed", eventId, error);
    return { error: "No pudimos guardar la imagen. Inténtalo otra vez." };
  }

  const previous = event.cardR2Key;

  await db
    .update(events)
    .set({
      cardR2Key: key,
      cardContentType: file.type,
      cardBytes: file.size,
      cardUploadedAt: new Date(),
      // A new file means the old handle points at the wrong picture. Cleared
      // rather than refreshed here: re-uploading belongs to the first send,
      // and an organizer who changes their mind twice should not pay for three
      // uploads to Meta.
      cardMediaId: null,
      cardMediaRefreshedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  // Best effort: an orphaned object costs a fraction of a cent, and failing the
  // upload because the *old* file would not delete helps nobody.
  if (previous && previous !== key) {
    deleteObject(r2, previous).catch((error) =>
      console.error("[card] could not remove replaced card", previous, error),
    );
  }

  revalidatePath(`/eventos/${eventId}`);
  return { ok: "Listo. Se enviará a cada invitado cuando confirme." };
}

export async function removeCard(eventId: string): Promise<ActionState & { ok?: string }> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };
  const event = guard.event;

  await db
    .update(events)
    .set({
      cardR2Key: null,
      cardContentType: null,
      cardBytes: null,
      cardUploadedAt: null,
      cardMediaId: null,
      cardMediaRefreshedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  const r2 = r2FromEnv();
  if (r2 && event.cardR2Key) {
    deleteObject(r2, event.cardR2Key).catch((error) =>
      console.error("[card] could not remove card", event.cardR2Key, error),
    );
  }

  revalidatePath(`/eventos/${eventId}`);
  return { ok: "Quitamos la imagen." };
}

/**
 * The "Save the Date" teaser.
 *
 * The other image on an event, and the opposite of the card in every way that
 * matters. The card is private: it goes to someone who has already confirmed,
 * it carries the venue, and the bucket it lives in deliberately has no public
 * URL. The teaser is the picture a registration link shows in WhatsApp, which
 * means it is seen by whoever is in that group chat and whoever they forward it
 * to. Two images, because one of them can never be the other.
 *
 * Downscaled on the way in. WhatsApp silently declines to show a link preview
 * whose image it considers heavy — no error, no fallback, just a bare link —
 * and an organizer would have no way to discover that. Better to make the file
 * fit than to hand back a rule about kilobytes.
 */
const TEASER_MAX_EDGE = 1200;

export async function uploadTeaser(
  eventId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { ok?: string }> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };
  const event = guard.event;

  const file = formData.get("teaser");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige una imagen." };
  if (!ALLOWED.has(file.type)) return { error: "La imagen tiene que ser JPG o PNG." };
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return { error: `La imagen pesa ${mb} MB y el máximo son 5 MB.` };
  }

  const r2 = r2FromEnv();
  if (!r2) return { error: "El almacenamiento de imágenes todavía no está configurado." };

  let optimized: Buffer;
  try {
    optimized = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(TEASER_MAX_EDGE, TEASER_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      // Flattened onto white before the JPEG: a PNG with transparency would
      // otherwise arrive with a black background, and a teaser is usually the
      // one image with a transparent edge.
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    console.error("[teaser] could not process image", eventId, error);
    return { error: "No pudimos procesar esa imagen. Prueba con otra." };
  }

  const key = `teasers/${eventId}/${Date.now()}.jpg`;

  try {
    // The Buffer itself, not `.buffer`: that is the memory underneath, which
    // can be larger than the image and start at an offset.
    await putObject(r2, key, optimized, "image/jpeg");
  } catch (error) {
    console.error("[teaser] upload failed", eventId, error);
    return { error: "No pudimos guardar la imagen. Inténtalo otra vez." };
  }

  const previous = event.teaserR2Key;

  await db
    .update(events)
    .set({
      teaserR2Key: key,
      teaserContentType: "image/jpeg",
      teaserBytes: optimized.byteLength,
      teaserUploadedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  if (previous && previous !== key) {
    deleteObject(r2, previous).catch((error) =>
      console.error("[teaser] could not remove replaced teaser", previous, error),
    );
  }

  revalidatePath(`/eventos/${eventId}`);
  return { ok: "Listo. Esta es la imagen que verán al compartir tu liga." };
}

export async function removeTeaser(eventId: string): Promise<ActionState & { ok?: string }> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };
  const event = guard.event;

  await db
    .update(events)
    .set({
      teaserR2Key: null,
      teaserContentType: null,
      teaserBytes: null,
      teaserUploadedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  const r2 = r2FromEnv();
  if (r2 && event.teaserR2Key) {
    deleteObject(r2, event.teaserR2Key).catch((error) =>
      console.error("[teaser] could not remove teaser", event.teaserR2Key, error),
    );
  }

  revalidatePath(`/eventos/${eventId}`);
  return { ok: "Quitamos la imagen." };
}
