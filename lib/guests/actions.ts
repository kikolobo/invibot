"use server";

import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { events, guests, suppressions } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/phone";
import { parseGuestList, hasError, type ParsedGuest } from "./import";

export type GuestActionState = { error?: string; ok?: string };

/** Loads an event the caller actually owns, or null. */
async function ownedEvent(eventId: string) {
  const { orgId } = await requireOrg();
  return db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.orgId, orgId)),
  });
}

const newToken = () => nanoid(24);

export async function addGuest(
  eventId: string,
  _prev: GuestActionState,
  formData: FormData,
): Promise<GuestActionState> {
  const event = await ownedEvent(eventId);
  if (!event) return { error: "No encontramos ese evento." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const rawEmail = String(formData.get("email") ?? "").trim();
  const groupLabel = String(formData.get("groupLabel") ?? "").trim() || null;
  const partyRaw = Number.parseInt(String(formData.get("partySizeAllowed") ?? "1"), 10);

  if (!fullName) return { error: "Falta el nombre." };

  let phoneE164: string | null = null;
  let phoneVariants: string[] = [];
  if (rawPhone) {
    const normalized = normalizePhone(rawPhone);
    if (!normalized) return { error: `Ese teléfono no parece válido: "${rawPhone}"` };
    phoneE164 = normalized.e164;
    phoneVariants = normalized.variants;
  }

  const email = rawEmail ? rawEmail.toLowerCase() : null;
  if (!phoneE164 && !email) {
    return { error: "Necesitamos al menos un teléfono o un correo para poder invitar." };
  }

  if (phoneE164) {
    const blocked = await db.query.suppressions.findFirst({
      where: eq(suppressions.phoneE164, phoneE164),
    });
    if (blocked) {
      return { error: "Esa persona pidió no recibir más invitaciones y no podemos contactarla." };
    }
    const already = await db.query.guests.findFirst({
      where: and(eq(guests.eventId, eventId), eq(guests.phoneE164, phoneE164)),
    });
    if (already) return { error: `${already.fullName} ya está en la lista con ese número.` };
  }

  await db.insert(guests).values({
    eventId,
    fullName,
    firstName: fullName.split(/\s+/)[0] || null,
    phoneE164,
    phoneVariants,
    email,
    groupLabel,
    partySizeAllowed: Math.min(
      Math.max(Number.isFinite(partyRaw) ? partyRaw : 1, 1),
      event.maxPartySize,
    ),
    accessToken: newToken(),
  });

  revalidatePath(`/eventos/${eventId}/invitados`);
  return { ok: `${fullName} agregado.` };
}

export async function updateGuest(
  eventId: string,
  guestId: string,
  _prev: GuestActionState,
  formData: FormData,
): Promise<GuestActionState> {
  const event = await ownedEvent(eventId);
  if (!event) return { error: "No encontramos ese evento." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const rawEmail = String(formData.get("email") ?? "").trim();
  if (!fullName) return { error: "Falta el nombre." };

  let phoneE164: string | null = null;
  let phoneVariants: string[] = [];
  if (rawPhone) {
    const normalized = normalizePhone(rawPhone);
    if (!normalized) return { error: `Ese teléfono no parece válido: "${rawPhone}"` };
    phoneE164 = normalized.e164;
    phoneVariants = normalized.variants;
  }

  await db
    .update(guests)
    .set({
      fullName,
      firstName: fullName.split(/\s+/)[0] || null,
      phoneE164,
      phoneVariants,
      email: rawEmail ? rawEmail.toLowerCase() : null,
      groupLabel: String(formData.get("groupLabel") ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(guests.id, guestId), eq(guests.eventId, eventId)));

  revalidatePath(`/eventos/${eventId}/invitados`);
  return { ok: "Guardado." };
}

export async function deleteGuests(eventId: string, guestIds: string[]) {
  const event = await ownedEvent(eventId);
  if (!event || guestIds.length === 0) return;

  await db
    .delete(guests)
    .where(and(eq(guests.eventId, eventId), inArray(guests.id, guestIds)));

  revalidatePath(`/eventos/${eventId}/invitados`);
}

export type ImportPreview = {
  parsed: ParsedGuest[];
  /** Rows that are valid on their own but collide with the saved list. */
  alreadyInList: number[];
  suppressed: number[];
  importable: number;
};

/**
 * Parses and checks a pasted list without writing anything, so the organizer
 * sees exactly what will happen before it happens.
 */
export async function previewImport(
  eventId: string,
  text: string,
): Promise<ImportPreview | { error: string }> {
  const event = await ownedEvent(eventId);
  if (!event) return { error: "No encontramos ese evento." };

  const { guests: parsed } = parseGuestList(text, event.maxPartySize);
  const phones = parsed.map((g) => g.phoneE164).filter((p): p is string => !!p);

  const existing = phones.length
    ? await db
        .select({ phoneE164: guests.phoneE164 })
        .from(guests)
        .where(and(eq(guests.eventId, eventId), inArray(guests.phoneE164, phones)))
    : [];
  const blocked = phones.length
    ? await db
        .select({ phoneE164: suppressions.phoneE164 })
        .from(suppressions)
        .where(inArray(suppressions.phoneE164, phones))
    : [];

  const existingSet = new Set(existing.map((r) => r.phoneE164));
  const blockedSet = new Set(blocked.map((r) => r.phoneE164));

  const alreadyInList = parsed
    .filter((g) => g.phoneE164 && existingSet.has(g.phoneE164))
    .map((g) => g.row);
  const suppressed = parsed
    .filter((g) => g.phoneE164 && blockedSet.has(g.phoneE164))
    .map((g) => g.row);

  const skip = new Set([...alreadyInList, ...suppressed]);
  const importable = parsed.filter((g) => !hasError(g) && !skip.has(g.row)).length;

  return { parsed, alreadyInList, suppressed, importable };
}

/**
 * Re-parses server-side rather than trusting rows posted back from the browser,
 * then writes only the rows that are clean, new, and not suppressed.
 */
export async function confirmImport(
  eventId: string,
  _prev: GuestActionState,
  formData: FormData,
): Promise<GuestActionState> {
  const event = await ownedEvent(eventId);
  if (!event) return { error: "No encontramos ese evento." };

  const text = String(formData.get("list") ?? "");
  const preview = await previewImport(eventId, text);
  if ("error" in preview) return preview;

  const skip = new Set([...preview.alreadyInList, ...preview.suppressed]);
  const rows = preview.parsed.filter((g) => !hasError(g) && !skip.has(g.row));
  if (rows.length === 0) {
    return { error: "No hay filas que se puedan importar." };
  }

  await db.insert(guests).values(
    rows.map((g) => ({
      eventId,
      fullName: g.fullName,
      firstName: g.firstName,
      phoneE164: g.phoneE164,
      phoneVariants: g.phoneVariants,
      email: g.email,
      groupLabel: g.groupLabel,
      partySizeAllowed: g.partySizeAllowed,
      accessToken: newToken(),
    })),
  );

  revalidatePath(`/eventos/${eventId}/invitados`);
  const skipped = preview.parsed.length - rows.length;
  return {
    ok:
      `Importamos ${rows.length} ${rows.length === 1 ? "invitado" : "invitados"}` +
      (skipped > 0 ? `, omitimos ${skipped}.` : "."),
  };
}
