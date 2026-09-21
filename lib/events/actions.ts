"use server";

import { z } from "zod";
import { and, eq, gt, ne } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { customAlphabet, nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { events, eventFacts, guests, guestGroups } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { eventKinds } from "./kinds";
import { newMapsCode } from "./maps";
import { resolveCoords } from "./geo";
import { partySizeFor } from "./party";
import { diffEvent } from "./changes";
import { editableEvent } from "./guard";
import { newRegistrationCode } from "@/lib/guests/auto-register";
import { emptyEventDetails, eventDetailsSchema } from "./details";
import { questionsFor, type Answers } from "./questions";
import { answersToFacts, setPath } from "./facts";
import { seedGroups } from "@/lib/guests/actions";

const slugId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 6);

/** Matches the guest tokens minted in `lib/guests/actions.ts`. */
const newEventToken = () => nanoid(24);

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "evento"}-${slugId()}`;
}

/**
 * Turns a wall-clock date and time in the event's own timezone into the absolute
 * instant we store. "7 PM" means 7 PM where the event happens, regardless of
 * where the organizer is sitting when they type it.
 */
function zonedToInstant(date: string, time: string, timezone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, timezone).getTime());
}

const basicsSchema = z
  .object({
    name: z.string().trim().min(2, "Ponle un nombre al evento").max(120),
    kind: z.enum(eventKinds),
    hostNames: z.string().trim().max(120).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha"),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Elige una hora"),
    timezone: z.string().min(1).default("America/Mexico_City"),
    venueName: z.string().trim().max(160).optional(),
    venueAddress: z.string().trim().max(300).optional(),
    venueCity: z.string().trim().max(120).optional(),
    venueState: z.string().trim().max(120).optional(),
    venueCountry: z.string().trim().length(2).optional(),
    venueMapsUrl: z
      .string()
      .trim()
      .url("Pega el link completo, empezando con https://")
      .max(500)
      .optional(),
    rsvpRequired: z.boolean().default(true),
    allowPlusOnes: z.boolean().default(false),
    qrEnabled: z.boolean().default(false),
    autoRegisterEnabled: z.boolean().default(false),
  });

export type ActionState = { error?: string; fieldErrors?: Record<string, string> };

export async function createEvent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();

  const parsed = basicsSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    hostNames: formData.get("hostNames") || undefined,
    date: formData.get("date"),
    time: formData.get("time"),
    timezone: formData.get("timezone") || "America/Mexico_City",
    venueName: formData.get("venueName") || undefined,
    venueAddress: formData.get("venueAddress") || undefined,
    venueCity: formData.get("venueCity") || undefined,
    venueState: formData.get("venueState") || undefined,
    venueCountry: formData.get("venueCountry") || undefined,
    venueMapsUrl: formData.get("venueMapsUrl") || undefined,
    rsvpRequired: formData.get("rsvpRequired") === "on",
    allowPlusOnes: formData.get("allowPlusOnes") === "on",
    qrEnabled: formData.get("qrEnabled") === "on",
    autoRegisterEnabled: formData.get("autoRegisterEnabled") === "on",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  const v = parsed.data;
  // Best-effort and never fatal: the pin is what lets the assistant send a
  // native map card, and an event with no coordinates simply falls back to the
  // link. Resolved on save so no guest ever waits on a geocoder.
  const coords = await resolveCoords({
    venueName: v.venueName ?? null,
    venueAddress: v.venueAddress ?? null,
    venueCity: v.venueCity ?? null,
    venueState: v.venueState ?? null,
    venueCountry: v.venueCountry ?? null,
    venueMapsUrl: v.venueMapsUrl ?? null,
  });

  const [created] = await db
    .insert(events)
    .values({
      orgId,
      createdByUserId: userId,
      slug: slugify(v.name),
      name: v.name,
      kind: v.kind,
      hostNames: v.hostNames ?? null,
      startsAt: zonedToInstant(v.date, v.time, v.timezone),
      timezone: v.timezone,
      venueName: v.venueName ?? null,
      venueAddress: v.venueAddress ?? null,
      venueCity: v.venueCity ?? null,
      venueState: v.venueState ?? null,
      venueCountry: v.venueCountry ?? null,
      venueMapsUrl: v.venueMapsUrl ?? null,
      venueLat: coords?.lat ?? null,
      venueLng: coords?.lng ?? null,
      mapsCode: newMapsCode(),
      rsvpRequired: v.rsvpRequired,
      allowPlusOnes: v.allowPlusOnes,
      maxPartySize: partySizeFor(v.allowPlusOnes),
      qrEnabled: v.qrEnabled,
      autoRegisterEnabled: v.autoRegisterEnabled,
      // Minted whether or not the feature starts on: the code is the event's
      // for good, so a link shared today keeps working if the host toggles the
      // feature off and on again.
      registrationCode: newRegistrationCode(),
      details: emptyEventDetails(),
    })
    .returning();

  await seedGroups(created.id, v.kind);

  redirect(`/eventos/${created.id}/detalles`);
}

/**
 * Saves questionnaire answers and rebuilds the intake-sourced facts.
 *
 * Only facts with `source = "intake"` are replaced. Anything the organizer
 * taught the assistant through an escalation survives, because those rows are
 * the accumulated knowledge that makes an event better at answering over time.
 */
export async function saveDetails(
  eventId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };
  const event = guard.event;

  const answers: Answers = {};
  for (const q of questionsFor(event.kind)) {
    const raw = formData.get(q.key);
    if (q.type === "boolean") {
      // Unanswered radio groups stay undefined so they produce no fact at all.
      if (raw === "si") answers[q.key] = true;
      else if (raw === "no") answers[q.key] = false;
    } else if (q.type === "urls") {
      const urls = String(raw ?? "")
        .split(/\s+/)
        .map((u) => u.trim())
        .filter(Boolean);
      if (urls.length) answers[q.key] = urls;
    } else if (raw !== null && String(raw).trim() !== "") {
      answers[q.key] = String(raw).trim();
    }
  }

  const nested: Record<string, unknown> = structuredClone(event.details);
  for (const [key, value] of Object.entries(answers)) setPath(nested, key, value);

  const details = eventDetailsSchema.safeParse(nested);
  if (!details.success) {
    return { error: "Algunas respuestas no son válidas. Revisa el formulario." };
  }

  const facts = answersToFacts(event.kind, answers);

  await db.transaction(async (tx) => {
    await tx
      .update(events)
      .set({ details: details.data, updatedAt: new Date() })
      .where(eq(events.id, eventId));

    await tx
      .delete(eventFacts)
      .where(and(eq(eventFacts.eventId, eventId), eq(eventFacts.source, "intake")));

    if (facts.length) {
      await tx.insert(eventFacts).values(
        facts.map((f) => ({
          eventId,
          key: f.key,
          question: f.question,
          answer: f.answer,
          questionNormalized: f.questionNormalized,
          source: "intake" as const,
          visibility: f.visibility,
        })),
      );
    }
  });

  revalidatePath(`/eventos/${eventId}`);
  redirect(`/eventos/${eventId}`);
}


/**
 * Turning companions on or off after the event exists.
 *
 * Set only at creation until now, which left an organizer who forgot the
 * checkbox with no way back — and left one event carrying `allowPlusOnes` with
 * a maximum of one, a combination the invitation cannot express.
 */
export async function updatePartySettings(
  eventId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { ok?: string }> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  const allowPlusOnes = formData.get("allowPlusOnes") === "on";
  const maxPartySize = partySizeFor(allowPlusOnes);

  await db
    .update(events)
    .set({ allowPlusOnes, maxPartySize, updatedAt: new Date() })
    .where(eq(events.id, eventId));

  // The event's setting is the default every guest gets, and the guest form
  // only makes exceptions to it — so changing it here has to reach the list in
  // both directions. Lowering it and leaving someone on two seats would keep
  // sending them the companion invitation for a companion just withdrawn;
  // raising it and leaving everyone on one would grant nobody anything.
  //
  // It does overwrite exceptions, which is the honest cost of a single column
  // holding both the default and the exception to it. Toggling the event
  // setting resets them, and that is predictable in a way "some of them
  // survived" would not be.
  const changed = await db
    .update(guests)
    .set({ partySizeAllowed: maxPartySize, updatedAt: new Date() })
    .where(and(eq(guests.eventId, eventId), ne(guests.partySizeAllowed, maxPartySize)))
    .returning({ id: guests.id });

  // A guest who confirmed more people than they are now offered cannot keep
  // the extra seat.
  await db
    .update(guests)
    .set({ partySizeConfirmed: maxPartySize, updatedAt: new Date() })
    .where(and(eq(guests.eventId, eventId), gt(guests.partySizeConfirmed, maxPartySize)));

  revalidatePath(`/eventos/${eventId}`);
  revalidatePath(`/eventos/${eventId}/invitados`);

  const note =
    changed.length > 0
      ? ` ${changed.length} ${changed.length === 1 ? "invitado pasó" : "invitados pasaron"} a ${maxPartySize} ${maxPartySize === 1 ? "lugar" : "lugares"}.`
      : "";

  return { ok: `Listo.${note}` };
}


/**
 * Turning auto-registro on and off.
 *
 * The code is minted once and kept forever after, even while the feature is
 * off: it is pasted into group chats that outlive the event, and a code that
 * changed on every toggle would turn links the host already shared into dead
 * ones. Off stops new registrations and nothing else — everyone already pending
 * stays pending, which is why the guest-facing effect of "off" and of a closed
 * event is the same sentence.
 */
export async function setAutoRegister(
  eventId: string,
  enabled: boolean,
): Promise<{ error?: string; ok?: string }> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  await db
    .update(events)
    .set({
      autoRegisterEnabled: enabled,
      registrationCode: guard.event.registrationCode ?? newRegistrationCode(),
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  revalidatePath(`/eventos/${eventId}`);
  revalidatePath(`/eventos/${eventId}/invitados`);

  return {
    ok: enabled
      ? "Auto-registro activado. Comparte el link con tus invitados."
      : "Auto-registro desactivado. Los registros pendientes siguen ahí.",
  };
}

/**
 * Renaming an event.
 *
 * The slug deliberately does not follow. It is the public microsite path that
 * every invitation already sent points at, and regenerating it would turn every
 * one of those links into a 404 — a rename is a label change, not a move.
 */
export async function renameEvent(
  eventId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { ok?: string }> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Ponle un nombre al evento." };
  if (name.length > 120) return { error: "Ese nombre es demasiado largo." };

  await db
    .update(events)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(events.id, eventId), eq(events.orgId, orgId)));

  revalidatePath(`/eventos/${eventId}`);
  revalidatePath("/eventos");
  return { ok: "Listo." };
}

/**
 * Copying an event to plan the next one.
 *
 * What carries over is the part that took work to write: the questionnaire
 * answers and the facts the assistant answers from. What does not is anything
 * that happened *to* the original — every send, conversation, RSVP and
 * delivery receipt belongs to the invitations that went out, and copying them
 * would fabricate a history for an event that has not happened yet.
 *
 * The new date is asked for rather than copied, because an identical event on
 * an identical date is not a thing anyone wants. Anything anchored to the old
 * date moves by the same amount.
 */
export async function cloneEvent(
  sourceId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();

  const source = await db.query.events.findFirst({
    where: and(eq(events.id, sourceId), eq(events.orgId, orgId)),
  });
  if (!source) return { error: "No encontramos ese evento." };

  const name = String(formData.get("name") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const copyGuests = formData.get("copyGuests") === "on";

  if (name.length < 2) return { fieldErrors: { name: "Ponle un nombre al evento" } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { fieldErrors: { date: "Elige una fecha" } };
  if (!/^\d{2}:\d{2}$/.test(time)) return { fieldErrors: { time: "Elige una hora" } };

  const startsAt = zonedToInstant(date, time, source.timezone);
  // Everything else anchored to the old date slides with it, so a three-hour
  // party stays three hours and an RSVP deadline keeps its lead time instead
  // of landing in the past.
  const shift = startsAt.getTime() - source.startsAt.getTime();
  const slide = (at: Date | null) => (at ? new Date(at.getTime() + shift) : null);

  const [created] = await db
    .insert(events)
    .values({
      orgId,
      createdByUserId: userId,
      slug: slugify(name),
      name,
      kind: source.kind,
      hostNames: source.hostNames,
      startsAt,
      endsAt: slide(source.endsAt),
      timezone: source.timezone,
      locale: source.locale,
      venueName: source.venueName,
      venueAddress: source.venueAddress,
      venueCity: source.venueCity,
      venueState: source.venueState,
      venueCountry: source.venueCountry,
      venueLat: source.venueLat,
      venueLng: source.venueLng,
      venuePlaceId: source.venuePlaceId,
      venueMapsUrl: source.venueMapsUrl,
      // Its own short link: the copy can be moved without breaking the original.
      mapsCode: newMapsCode(),
      rsvpRequired: source.rsvpRequired,
      rsvpDeadline: slide(source.rsvpDeadline),
      allowPlusOnes: source.allowPlusOnes,
      maxPartySize: source.maxPartySize,
      capacity: source.capacity,
      details: source.details,
      // `status` and `publishedAt` stay at their defaults: a copy is a draft,
      // however far along the original got.
    })
    .returning();

  // The assistant's knowledge is the valuable part of a clone. `timesUsed`
  // resets because it counts this event's conversations, and a fact learned
  // from an escalation loses that link — the escalation belongs to the
  // original's guests.
  const facts = await db.select().from(eventFacts).where(eq(eventFacts.eventId, sourceId));
  if (facts.length > 0) {
    await db.insert(eventFacts).values(
      facts.map((fact) => ({
        eventId: created.id,
        key: fact.key,
        question: fact.question,
        answer: fact.answer,
        questionNormalized: fact.questionNormalized,
        source: fact.source,
        visibility: fact.visibility,
      })),
    );
  }

  const groups = await db.select().from(guestGroups).where(eq(guestGroups.eventId, sourceId));
  const groupMap = new Map<string, string>();
  if (groups.length > 0) {
    const inserted = await db
      .insert(guestGroups)
      .values(
        groups.map((group) => ({
          eventId: created.id,
          name: group.name,
          normalizedName: group.normalizedName,
          sortOrder: group.sortOrder,
        })),
      )
      .returning({ id: guestGroups.id, normalizedName: guestGroups.normalizedName });

    const byNormalized = new Map(inserted.map((g) => [g.normalizedName, g.id]));
    for (const group of groups) {
      const next = byNormalized.get(group.normalizedName);
      if (next) groupMap.set(group.id, next);
    }
  }

  if (copyGuests) {
    const people = await db.select().from(guests).where(eq(guests.eventId, sourceId));
    if (people.length > 0) {
      await db.insert(guests).values(
        people.map((guest) => ({
          eventId: created.id,
          fullName: guest.fullName,
          firstName: guest.firstName,
          phoneE164: guest.phoneE164,
          phoneVariants: guest.phoneVariants,
          email: guest.email,
          locale: guest.locale,
          // Remapped, or the guest would point at the original's group row.
          groupId: guest.groupId ? (groupMap.get(guest.groupId) ?? null) : null,
          partySizeAllowed: guest.partySizeAllowed,
          notes: guest.notes,
          // A fresh token: the old one addresses the old event's microsite,
          // and the column is globally unique anyway.
          accessToken: newEventToken(),
          // Carried, not reset. Someone who asked not to be contacted did not
          // ask only about one party.
          optedOut: guest.optedOut,
          optedOutAt: guest.optedOutAt,
          // Everything else starts empty: this event has invited nobody yet,
          // so nobody has answered it.
        })),
      );
    }
  }

  revalidatePath("/eventos");
  redirect(`/eventos/${created.id}`);
}


/**
 * Archiving, which is this app's delete.
 *
 * Nothing is removed. An event carries the message ledger for every invitation
 * it sent and the RSVPs people gave it — a real delete would destroy the record
 * of messages that actually reached real phones, which is not ours to destroy.
 * Archiving takes the event out of the way and locks it instead.
 */
export async function archiveEvent(eventId: string): Promise<ActionState & { ok?: string }> {
  const { orgId } = await requireOrg();

  const [updated] = await db
    .update(events)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(events.id, eventId), eq(events.orgId, orgId)))
    .returning({ id: events.id });

  if (!updated) return { error: "No encontramos ese evento." };

  revalidatePath("/eventos");
  revalidatePath(`/eventos/${eventId}`);
  return { ok: "Evento archivado." };
}

export async function unarchiveEvent(eventId: string): Promise<ActionState & { ok?: string }> {
  const { orgId } = await requireOrg();

  // `status` is untouched in both directions, so an event comes back exactly
  // where it left off rather than reset to a draft.
  const [updated] = await db
    .update(events)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(events.id, eventId), eq(events.orgId, orgId)))
    .returning({ id: events.id });

  if (!updated) return { error: "No encontramos ese evento." };

  revalidatePath("/eventos");
  revalidatePath(`/eventos/${eventId}`);
  return { ok: "Evento restaurado." };
}


/**
 * Turns the QR pass on or off for an event.
 *
 * Switching it off does not revoke what is already out: those guests were told
 * to bring a code and some of them will. It only stops new ones being issued.
 */
export async function setQrEnabled(
  eventId: string,
  enabled: boolean,
): Promise<ActionState & { ok?: string }> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  await db
    .update(events)
    .set({ qrEnabled: enabled, updatedAt: new Date() })
    .where(eq(events.id, eventId));

  revalidatePath(`/eventos/${eventId}`);
  return {
    ok: enabled
      ? "Listo. Cada invitado que confirme recibirá su código."
      : "Listo. Ya no enviaremos códigos nuevos.",
  };
}


const basicsEditSchema = z.object({
  name: z.string().trim().min(2, "Ponle un nombre al evento").max(120),
  hostNames: z.string().trim().max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Elige una hora"),
  venueName: z.string().trim().max(160).optional(),
  venueAddress: z.string().trim().max(300).optional(),
  venueCity: z.string().trim().max(120).optional(),
  venueState: z.string().trim().max(120).optional(),
  venueCountry: z.string().trim().length(2).optional(),
  venueMapsUrl: z
    .string()
    .trim()
    .url("Pega el link completo, empezando con https://")
    .max(500)
    .optional(),
  rsvpRequired: z.boolean().default(true),
  allowPlusOnes: z.boolean().default(false),
  qrEnabled: z.boolean().default(false),
  /**
   * 0 turns the reminder off; 1 is treated as off too, because the day before
   * already has its own message. Thirty days out it stops being a reminder.
   */
  reminderDaysBefore: z.coerce.number().int().min(0).max(30).default(3),
});

/**
 * Editing the things the invitation says.
 *
 * Venues move and dates shift, and until now the only way to correct either was
 * to start the event over. The assistant reads these straight off the event, so
 * a change here is a change to what it tells guests from the next message on —
 * but it cannot reach the invitations already on their phones, which is why the
 * form says so when any have gone out.
 */
export type BasicsResult = ActionState & {
  ok?: string;
  /** Everything that moved, for the review panel. */
  changed?: string[];
  /** The sentence guests would be sent, when any of it concerns them. */
  summary?: string;
};

export async function updateEventBasics(
  eventId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<BasicsResult> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };
  const event = guard.event;

  const parsed = basicsEditSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    hostNames: formData.get("hostNames") || undefined,
    date: String(formData.get("date") ?? ""),
    time: String(formData.get("time") ?? ""),
    venueName: formData.get("venueName") || undefined,
    venueAddress: formData.get("venueAddress") || undefined,
    venueCity: formData.get("venueCity") || undefined,
    venueState: formData.get("venueState") || undefined,
    venueCountry: formData.get("venueCountry") || undefined,
    venueMapsUrl: formData.get("venueMapsUrl") || undefined,
    rsvpRequired: formData.get("rsvpRequired") === "on",
    allowPlusOnes: formData.get("allowPlusOnes") === "on",
    qrEnabled: formData.get("qrEnabled") === "on",
    reminderDaysBefore: formData.get("reminderDaysBefore") ?? 3,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  const v = parsed.data;
  // The event keeps its own timezone: "7 PM" means seven where the party is,
  // and editing the date should not quietly reinterpret it somewhere else.
  const startsAt = zonedToInstant(v.date, v.time, event.timezone);

  const maxPartySize = partySizeFor(v.allowPlusOnes);

  // Only when the address actually moved: geocoding is a network call, and an
  // organizer fixing a typo in the event name should not wait on it — nor risk
  // a transient failure blanking a pin that was already right.
  const venueMoved =
    v.venueName !== (event.venueName ?? undefined) ||
    v.venueAddress !== (event.venueAddress ?? undefined) ||
    v.venueCity !== (event.venueCity ?? undefined) ||
    v.venueState !== (event.venueState ?? undefined) ||
    v.venueCountry !== (event.venueCountry ?? undefined) ||
    v.venueMapsUrl !== (event.venueMapsUrl ?? undefined);

  // An event saved before coordinates existed has none; resolve those too, or
  // the pin never appears for anyone who does not happen to move their venue.
  const needsCoords = venueMoved || event.venueLat === null || event.venueLng === null;

  const coords = needsCoords
    ? await resolveCoords({
        venueName: v.venueName ?? null,
        venueAddress: v.venueAddress ?? null,
        venueCity: v.venueCity ?? null,
        venueState: v.venueState ?? null,
        venueCountry: v.venueCountry ?? null,
        venueMapsUrl: v.venueMapsUrl ?? null,
      })
    : { lat: event.venueLat, lng: event.venueLng };

  const [after] = await db
    .update(events)
    .set({
      name: v.name,
      // The slug deliberately does not follow a rename: it is the public path
      // every invitation already sent points at.
      hostNames: v.hostNames ?? null,
      startsAt,
      venueName: v.venueName ?? null,
      venueAddress: v.venueAddress ?? null,
      venueCity: v.venueCity ?? null,
      venueState: v.venueState ?? null,
      venueCountry: v.venueCountry ?? null,
      venueMapsUrl: v.venueMapsUrl ?? null,
      venueLat: coords?.lat ?? null,
      venueLng: coords?.lng ?? null,
      rsvpRequired: v.rsvpRequired,
      allowPlusOnes: v.allowPlusOnes,
      maxPartySize,
      qrEnabled: v.qrEnabled,
      reminderDaysBefore: v.reminderDaysBefore,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId))
    .returning();

  // The companion rule applies to invitations not yet sent. People already
  // holding one keep what they were given — including a confirmed +1, which is
  // a seat somebody is counting on.
  await db
    .update(guests)
    .set({ partySizeAllowed: maxPartySize, updatedAt: new Date() })
    .where(
      and(
        eq(guests.eventId, eventId),
        ne(guests.partySizeAllowed, maxPartySize),
        eq(guests.inviteStatus, "pending"),
      ),
    );

  revalidatePath(`/eventos/${eventId}`);
  revalidatePath(`/eventos/${eventId}/simulador`);
  revalidatePath(`/eventos/${eventId}/reporte`);

  // Handed back so the page can ask whether anyone should be told, rather than
  // deciding for the organizer.
  const diff = diffEvent(event, after);
  return { ok: "Guardado.", changed: diff.all, summary: diff.summary ?? undefined };
}
