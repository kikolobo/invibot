"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { guests, guestGroups, suppressions } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { editableEvent } from "@/lib/events/guard";
import type { EventKind } from "@/lib/events/kinds";
import { normalizePhone } from "@/lib/phone";
import { parseGuestList, hasError, type ParsedGuest } from "./import";
import { recordGuestEvent } from "./history";
import { cleanGroupName, normalizeGroupName, suggestedGroups } from "./groups";
import { MAX_PARTY_SIZE } from "@/lib/events/party";

export type GuestActionState = { error?: string; ok?: string };

/**
 * Loads an event the caller owns *and* may change, or null.
 *
 * Every guest mutation goes through here, so archiving an event freezes its
 * list without each action having to remember to check.
 */
async function ownedEvent(eventId: string) {
  const { orgId } = await requireOrg();
  const guard = await editableEvent(eventId, orgId);
  return guard.ok ? guard.event : null;
}

const newToken = () => nanoid(24);

/**
 * Finds the group by its normalized name, or creates it. Returning the existing
 * row for a near-miss is the point: "familia novia" typed into the box lands on
 * the "Familia de la novia" that already exists instead of forking it.
 */
export async function resolveGroup(
  eventId: string,
  rawName: string | null | undefined,
): Promise<string | null> {
  const name = cleanGroupName(rawName ?? "");
  const normalized = normalizeGroupName(name);
  if (!normalized) return null;

  const existing = await db.query.guestGroups.findFirst({
    where: and(eq(guestGroups.eventId, eventId), eq(guestGroups.normalizedName, normalized)),
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(guestGroups)
    .values({ eventId, name, normalizedName: normalized })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;

  // Lost a race with a concurrent insert; the other one is just as good.
  const raced = await db.query.guestGroups.findFirst({
    where: and(eq(guestGroups.eventId, eventId), eq(guestGroups.normalizedName, normalized)),
  });
  return raced?.id ?? null;
}

/** Seeds an event's vocabulary with the groups typical for its kind. */
export async function seedGroups(eventId: string, kind: EventKind) {
  const names = suggestedGroups(kind);
  await db
    .insert(guestGroups)
    .values(
      names.map((name, index) => ({
        eventId,
        name,
        normalizedName: normalizeGroupName(name),
        sortOrder: index,
      })),
    )
    .onConflictDoNothing();
}

export async function listGroups(eventId: string): Promise<string[]> {
  const rows = await db
    .select({ name: guestGroups.name, sortOrder: guestGroups.sortOrder })
    .from(guestGroups)
    .where(eq(guestGroups.eventId, eventId))
    .orderBy(asc(guestGroups.sortOrder), asc(guestGroups.name));
  return rows.map((r) => r.name);
}

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
  const groupName = String(formData.get("group") ?? "").trim() || null;

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

  const table = readTable(formData.get("tableNumber"));
  if ("error" in table) return { error: table.error };

  await db.insert(guests).values({
    eventId,
    fullName,
    firstName: fullName.split(/\s+/)[0] || null,
    phoneE164,
    phoneVariants,
    email,
    groupId: await resolveGroup(eventId, groupName),
    // Clamped to the event: ticking the box on an event that offers no
    // companions cannot conjure a second seat.
    partySizeAllowed:
      formData.get("bringsCompanion") === "on" ? Math.min(2, event.maxPartySize) : 1,
    tableNumber: table.value,
    isVip: formData.get("isVip") === "on",
    notes: String(formData.get("notes") ?? "").trim() || null,
    accessToken: newToken(),
  });

  revalidatePath(`/eventos/${eventId}/invitados`);
  return { ok: `${fullName} agregado.` };
}

/**
 * Reads the table field, or says why it will not.
 *
 * Normalised rather than stored as typed: "0005" and "5" are one table, and
 * keeping both spellings means the same table sorts in two places and counts
 * twice in any report built on it later. Table 0 does not exist on any floor
 * plan, so a field of zeroes is a typo, not a table.
 */
function readTable(input: FormDataEntryValue | null): { value: string | null } | { error: string } {
  const raw = String(input ?? "").trim();
  if (!raw) return { value: null };

  if (!/^\d{1,5}$/.test(raw)) {
    return { error: "La mesa debe ser un número de hasta 5 dígitos." };
  }

  const normalized = String(Number.parseInt(raw, 10));
  if (normalized === "0") return { error: "La mesa no puede ser 0." };

  return { value: normalized };
}

/** The states an organizer may set by hand. Waitlist has no UI yet. */
const settableRsvp = new Set(["no_response", "confirmed", "declined", "maybe"]);

/**
 * Correcting a guest.
 *
 * Mostly this is fixing a typo in a phone number, which is the one field here
 * with consequences: the invitation already went to the *old* number, the new
 * one may belong to someone who opted out, and it may already be on this list.
 */
export async function updateGuest(
  eventId: string,
  guestId: string,
  _prev: GuestActionState,
  formData: FormData,
): Promise<GuestActionState> {
  const event = await ownedEvent(eventId);
  if (!event) return { error: "No encontramos ese evento." };

  const guest = await db.query.guests.findFirst({
    where: and(eq(guests.id, guestId), eq(guests.eventId, eventId)),
  });
  if (!guest) return { error: "No encontramos a esa persona." };

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

  const email = rawEmail ? rawEmail.toLowerCase() : null;
  if (!phoneE164 && !email) {
    return { error: "Necesitamos al menos un teléfono o un correo para poder invitar." };
  }

  const phoneChanged = phoneE164 !== guest.phoneE164;

  if (phoneChanged && phoneE164) {
    // The unique index on (event, phone) would otherwise surface as a 500.
    const clash = await db.query.guests.findFirst({
      where: and(eq(guests.eventId, eventId), eq(guests.phoneE164, phoneE164)),
    });
    if (clash && clash.id !== guestId) {
      return { error: `${clash.fullName} ya está en la lista con ese número.` };
    }

    const blocked = await db.query.suppressions.findFirst({
      where: inArray(suppressions.phoneE164, normalizePhone(rawPhone)?.variants ?? []),
    });
    if (blocked) {
      return { error: "Esa persona pidió no recibir más invitaciones y no podemos contactarla." };
    }
  }

  const tableNumber = readTable(formData.get("tableNumber"));
  if ("error" in tableNumber) return { error: tableNumber.error };

  const requestedRsvp = String(formData.get("rsvpStatus") ?? guest.rsvpStatus);
  const rsvpStatus = settableRsvp.has(requestedRsvp) ? requestedRsvp : guest.rsvpStatus;

  // What they were offered. Capped by the event: a guest cannot be given a
  // companion at an event that does not offer one.
  const companion = formData.get("bringsCompanion") === "on";
  const partySizeAllowed = companion ? Math.min(MAX_PARTY_SIZE, event.maxPartySize) : 1;

  // How many are actually coming. Clamped to what they were offered, so
  // confirming two people for a single seat is not expressible — not by a
  // tampered form and not by a stale page whose checkbox said otherwise.
  const requestedConfirmed = Number.parseInt(String(formData.get("partySizeConfirmed") ?? "1"), 10);
  const partySizeConfirmed = Math.min(
    Math.max(Number.isFinite(requestedConfirmed) ? requestedConfirmed : 1, 1),
    partySizeAllowed,
  );

  await db
    .update(guests)
    .set({
      fullName,
      firstName: fullName.split(/\s+/)[0] || null,
      phoneE164,
      phoneVariants,
      email,
      groupId: await resolveGroup(eventId, String(formData.get("group") ?? "")),
      isVip: formData.get("isVip") === "on",
      tableNumber: tableNumber.value,
      notes: String(formData.get("notes") ?? "").trim() || null,
      partySizeAllowed,
      rsvpStatus: rsvpStatus as typeof guest.rsvpStatus,
      // Set when the organizer records an answer, cleared when they take it
      // back. Existing timestamps are left alone so a guest's own reply keeps
      // the moment they actually sent it.
      rsvpRespondedAt:
        rsvpStatus === "no_response"
          ? null
          : (guest.rsvpRespondedAt ?? (rsvpStatus !== guest.rsvpStatus ? new Date() : null)),
      // Only meaningful once they are coming; cleared when they are not, so a
      // guest who cancels stops counting toward the seat total.
      partySizeConfirmed: rsvpStatus === "confirmed" ? partySizeConfirmed : null,
      // A corrected number has not been invited — the invitation went to the
      // old one. Resetting this puts them back in the send list instead of
      // leaving them permanently "Enviada" at a number that was never theirs.
      ...(phoneChanged ? { inviteStatus: "pending" as const } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(guests.id, guestId), eq(guests.eventId, eventId)));

  // Only when the answer actually moved: opening the form and saving it
  // unchanged is not a guest changing their mind.
  if (rsvpStatus !== guest.rsvpStatus && rsvpStatus !== "no_response") {
    await recordGuestEvent({
      eventId,
      guestId,
      type: rsvpStatus === "confirmed" ? "confirmed" : "declined",
      at: new Date(),
      source: "organizer",
      detail: { seats: partySizeConfirmed, from: guest.rsvpStatus },
    });
  }

  if (rsvpStatus === "confirmed" && partySizeConfirmed !== guest.partySizeConfirmed) {
    await recordGuestEvent({
      eventId,
      guestId,
      type: "party_size_changed",
      at: new Date(),
      source: "organizer",
      detail: { from: guest.partySizeConfirmed, to: partySizeConfirmed },
    });
  }

  revalidatePath(`/eventos/${eventId}/invitados`);

  const note =
    phoneChanged && guest.inviteStatus !== "pending"
      ? " La invitación anterior se envió al número viejo; puedes volver a invitarle."
      : "";
  return { ok: `Guardado.${note}` };
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

  // Resolve each distinct group name once, so a 200-row import does not issue
  // 200 lookups for the same four groups.
  const groupIds = new Map<string, string | null>();
  for (const name of new Set(rows.map((g) => g.groupLabel).filter(Boolean) as string[])) {
    groupIds.set(name, await resolveGroup(eventId, name));
  }

  await db.insert(guests).values(
    rows.map((g) => ({
      eventId,
      fullName: g.fullName,
      firstName: g.firstName,
      phoneE164: g.phoneE164,
      phoneVariants: g.phoneVariants,
      email: g.email,
      groupId: g.groupLabel ? (groupIds.get(g.groupLabel) ?? null) : null,
      partySizeAllowed: g.partySizeAllowed,
      tableNumber: g.tableNumber,
      isVip: g.isVip,
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
