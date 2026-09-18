"use server";

import { and, asc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";
import { db } from "@/db";
import { events, organizers } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { editableEvent } from "@/lib/events/guard";
import { normalizePhone } from "@/lib/phone";

export type OrganizerState = { error?: string; ok?: string };

/** Six characters, no confusable glyphs — read aloud and retyped like any code. */
const newStaffCode = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 6);

/**
 * Adding somebody who helps run the event.
 *
 * The first one added becomes the responder. That is the rule that makes "who
 * answers guests?" have no undefined state: it is never nobody, and marking
 * somebody else moves it rather than clearing it.
 */
export async function addOrganizer(
  eventId: string,
  _prev: OrganizerState,
  formData: FormData,
): Promise<OrganizerState> {
  const { orgId } = await requireOrg();
  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  const fullName = String(formData.get("fullName") ?? "").replace(/\s+/g, " ").trim();
  if (!fullName) return { error: "Falta el nombre." };

  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Ese teléfono no se ve bien. Revisa el número." };

  const existing = await db
    .select({ id: organizers.id })
    .from(organizers)
    .where(eq(organizers.eventId, eventId));

  if (existing.length >= 10) {
    return { error: "Diez organizadores es el máximo por evento." };
  }

  try {
    await db.insert(organizers).values({
      eventId,
      fullName,
      phoneE164: phone.e164,
      phoneVariants: phone.variants,
      // Never zero responders: whoever arrives first is it.
      isResponder: existing.length === 0,
    });
  } catch {
    // The only unique constraint they can hit is (event, phone).
    return { error: "Ese teléfono ya está en la lista." };
  }

  // Minted lazily so events created before this feature get one the moment they
  // need it, rather than needing a backfill.
  if (!guard.event.staffCode) {
    await db
      .update(events)
      .set({ staffCode: newStaffCode(), updatedAt: new Date() })
      .where(eq(events.id, eventId));
  }

  revalidatePath(`/eventos/${eventId}/organizadores`);
  return { ok: `${fullName.split(" ")[0]} quedó en la lista.` };
}

/**
 * Correcting somebody already on the list.
 *
 * A phone typed wrong is the whole failure: an organizador whose number is off
 * by a digit is silently not an organizador at all — their commands go
 * unanswered and a guest's question reaches a stranger's phone or nobody's.
 * Being unable to fix it without deleting and re-adding also loses whether
 * they were the responder.
 */
export async function updateOrganizer(
  eventId: string,
  organizerId: string,
  _prev: OrganizerState,
  formData: FormData,
): Promise<OrganizerState> {
  const { orgId } = await requireOrg();
  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  const fullName = String(formData.get("fullName") ?? "").replace(/\s+/g, " ").trim();
  if (!fullName) return { error: "Falta el nombre." };

  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Ese teléfono no se ve bien. Revisa el número." };

  try {
    await db
      .update(organizers)
      .set({
        fullName,
        phoneE164: phone.e164,
        phoneVariants: phone.variants,
        updatedAt: new Date(),
      })
      .where(and(eq(organizers.eventId, eventId), eq(organizers.id, organizerId)));
  } catch {
    return { error: "Ese teléfono ya está en la lista." };
  }

  revalidatePath(`/eventos/${eventId}/organizadores`);
  return { ok: "Guardado." };
}

/**
 * Moving who answers guests.
 *
 * Cleared then set, in that order: the database allows only one responder per
 * event, so setting before clearing would collide with the person being
 * replaced.
 */
export async function setResponder(eventId: string, organizerId: string): Promise<OrganizerState> {
  const { orgId } = await requireOrg();
  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  await db
    .update(organizers)
    .set({ isResponder: false, updatedAt: new Date() })
    .where(and(eq(organizers.eventId, eventId), ne(organizers.id, organizerId)));

  await db
    .update(organizers)
    .set({ isResponder: true, updatedAt: new Date() })
    .where(and(eq(organizers.eventId, eventId), eq(organizers.id, organizerId)));

  revalidatePath(`/eventos/${eventId}/organizadores`);
  return {};
}

/**
 * Removing somebody.
 *
 * If they were the one answering guests, the job passes to whoever has been on
 * the list longest. Leaving it empty would mean the next guest question reaches
 * nobody, and nothing would say so.
 */
export async function removeOrganizer(
  eventId: string,
  organizerId: string,
): Promise<OrganizerState> {
  const { orgId } = await requireOrg();
  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  const [removed] = await db
    .delete(organizers)
    .where(and(eq(organizers.eventId, eventId), eq(organizers.id, organizerId)))
    .returning({ wasResponder: organizers.isResponder });

  if (removed?.wasResponder) {
    const [next] = await db
      .select({ id: organizers.id })
      .from(organizers)
      .where(eq(organizers.eventId, eventId))
      .orderBy(asc(organizers.createdAt))
      .limit(1);

    if (next) {
      await db
        .update(organizers)
        .set({ isResponder: true, updatedAt: new Date() })
        .where(eq(organizers.id, next.id));
    }
  }

  revalidatePath(`/eventos/${eventId}/organizadores`);
  return {};
}
