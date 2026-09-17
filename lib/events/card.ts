"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { events } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
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
