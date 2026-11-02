"use server";

import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { events, guestGroups, guests, organizers } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";
import { seedGroups } from "@/lib/guests/actions";
import { setResponder } from "@/lib/organizers/actions";
import { editableEvent } from "./guard";
import { eventKinds } from "./kinds";
import { coordsFromShortLink, resolveCoords } from "./geo";
import { partySizeFor } from "./party";
import { isTimezone, wallClock, zonedToInstant } from "./zones";
import { deadlineFromDate, deadlineError } from "./rsvp-deadline";
import type { ActionState } from "./actions";

/**
 * The new-event wizard after its first step, which creates the event
 * (`startEvent`). Each step saves what it shows, then goes on — or, on «Lo
 * completo después», straight to the questionnaire. Saving either way: what
 * somebody typed before deciding to stop is still worth keeping.
 */
export type WizardStep = 1 | 2 | 3 | 4;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const stepSchemas = {
  1: z.object({
    name: z.string().trim().min(2, "Ponle un nombre al evento").max(120),
    kind: z.enum(eventKinds, { message: "Elige qué tipo de evento es" }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha"),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Elige una hora"),
  }),
  2: z.object({
    hostNames: optional(120),
    responderName: optional(120),
    responderPhone: optional(40),
  }),
  3: z.object({
    venueName: optional(160),
    venueAddress: optional(300),
    venueCity: optional(120),
    venueState: optional(120),
    venuePostalCode: optional(12),
    venueCountry: z.string().trim().length(2).default("MX"),
    venueMapsUrl: z.union([
      z.literal("").transform(() => null),
      z.string().trim().url("Pega el link completo, empezando con https://").max(500),
    ]),
    timezone: z.string().refine(isTimezone, "Elige una zona horaria"),
  }),
  4: z.object({
    rsvpRequired: z.boolean(),
    allowPlusOnes: z.boolean(),
    qrEnabled: z.boolean(),
    autoRegisterEnabled: z.boolean(),
    reminderDaysBefore: z.coerce.number().int().min(0, "De 0 a 30").max(30, "De 0 a 30"),
    rsvpDeadline: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha")]),
  }),
};

function fieldErrors(error: z.ZodError): ActionState {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
  return { fieldErrors: errors };
}

export async function saveWizardStep(
  eventId: string,
  step: WizardStep,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await editableEvent(eventId, "event");
  if (!guard.ok) return { error: guard.error };
  const event = guard.event;

  const text = (key: string) => String(formData.get(key) ?? "");
  const on = (key: string) => formData.get(key) === "on";

  if (step === 1) {
    const parsed = stepSchemas[1].safeParse({
      name: text("name"),
      kind: text("kind"),
      date: text("date"),
      time: text("time"),
    });
    if (!parsed.success) return fieldErrors(parsed.error);
    const v = parsed.data;
    await db
      .update(events)
      .set({
        name: v.name,
        kind: v.kind,
        startsAt: zonedToInstant(v.date, v.time, event.timezone),
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));
    // The groups were suggested for the old kind. Swapped while nobody is
    // filed under them; after that they are the host's own list.
    if (v.kind !== event.kind) {
      const [{ n }] = await db.select({ n: count() }).from(guests).where(eq(guests.eventId, eventId));
      if (n === 0) {
        await db.delete(guestGroups).where(eq(guestGroups.eventId, eventId));
        await seedGroups(eventId, v.kind);
      }
    }
  }

  if (step === 2) {
    const parsed = stepSchemas[2].safeParse({
      hostNames: text("hostNames"),
      responderName: text("responderName"),
      responderPhone: text("responderPhone"),
    });
    if (!parsed.success) return fieldErrors(parsed.error);
    const v = parsed.data;
    if (v.responderPhone) {
      const failed = await makeResponder(eventId, v.responderName, v.responderPhone);
      if (failed) return { fieldErrors: failed };
    }
    await db
      .update(events)
      .set({ hostNames: v.hostNames, updatedAt: new Date() })
      .where(eq(events.id, eventId));
  }

  if (step === 3) {
    const parsed = stepSchemas[3].safeParse({
      venueName: text("venueName"),
      venueAddress: text("venueAddress"),
      venueCity: text("venueCity"),
      venueState: text("venueState"),
      venuePostalCode: text("venuePostalCode"),
      venueCountry: text("venueCountry") || undefined,
      venueMapsUrl: text("venueMapsUrl"),
      timezone: text("timezone"),
    });
    if (!parsed.success) return fieldErrors(parsed.error);
    const v = parsed.data;
    const coords = await resolveCoords({
      venueName: v.venueName,
      venueAddress: v.venueAddress,
      venueCity: v.venueCity,
      venueState: v.venueState,
      venuePostalCode: v.venuePostalCode,
      venueCountry: v.venueCountry,
      venueMapsUrl: v.venueMapsUrl,
    });
    // The hour typed in step one stays the hour on the invitation: moving the
    // zone moves the instant, not the clock on the wall.
    const { date, time } = wallClock(event.startsAt, event.timezone);
    await db
      .update(events)
      .set({
        venueName: v.venueName,
        venueAddress: v.venueAddress,
        venueCity: v.venueCity,
        venueState: v.venueState,
        venuePostalCode: v.venuePostalCode,
        venueCountry: v.venueCountry,
        venueMapsUrl: v.venueMapsUrl,
        venueLat: coords?.lat ?? null,
        venueLng: coords?.lng ?? null,
        timezone: v.timezone,
        startsAt: zonedToInstant(date, time, v.timezone),
        // The deadline is a day on the same wall, and moves with it.
        rsvpDeadline: event.rsvpDeadline
          ? deadlineFromDate(wallClock(event.rsvpDeadline, event.timezone).date, v.timezone)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));
  }

  if (step === 4) {
    const parsed = stepSchemas[4].safeParse({
      rsvpRequired: on("rsvpRequired"),
      allowPlusOnes: on("allowPlusOnes"),
      qrEnabled: on("qrEnabled"),
      autoRegisterEnabled: on("autoRegisterEnabled"),
      reminderDaysBefore: text("reminderDaysBefore") || 3,
      rsvpDeadline: text("rsvpDeadline"),
    });
    if (!parsed.success) return fieldErrors(parsed.error);
    const v = parsed.data;
    const late = deadlineError(v.rsvpDeadline, event);
    if (late) return { fieldErrors: { rsvpDeadline: late } };
    await db
      .update(events)
      .set({
        rsvpRequired: v.rsvpRequired,
        allowPlusOnes: v.allowPlusOnes,
        maxPartySize: partySizeFor(v.allowPlusOnes),
        qrEnabled: v.qrEnabled,
        autoRegisterEnabled: v.autoRegisterEnabled,
        reminderDaysBefore: v.reminderDaysBefore,
        rsvpDeadline: v.rsvpDeadline ? deadlineFromDate(v.rsvpDeadline, event.timezone) : null,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));
  }

  revalidatePath(`/eventos/${eventId}`, "layout");
  const later = formData.get("intent") === "later";
  redirect(
    later || step === 4
      ? `/eventos/${eventId}/detalles`
      : `/eventos/nuevo/${eventId}?paso=${step + 1}`,
  );
}

/**
 * Whoever guests' questions should reach. The owner when it is their own
 * number — already on the list from the moment the event was made — otherwise
 * somebody added by phone alone, the way the organizadores page adds them.
 */
async function makeResponder(
  eventId: string,
  name: string | null,
  rawPhone: string,
): Promise<Record<string, string> | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { responderPhone: "Ese número no se ve bien. Revisa la lada." };

  const team = await db
    .select({ id: organizers.id, phoneE164: organizers.phoneE164, isOwner: organizers.isOwner, userId: organizers.userId })
    .from(organizers)
    .where(eq(organizers.eventId, eventId));
  let row = team.find((member) => phone.variants.includes(member.phoneE164));

  if (!row) {
    if (!name) return { responderName: "¿Cómo se llama quien va a contestar?" };
    [row] = await db
      .insert(organizers)
      .values({ eventId, fullName: name, phoneE164: phone.e164, phoneVariants: phone.variants })
      .returning({ id: organizers.id, phoneE164: organizers.phoneE164, isOwner: organizers.isOwner, userId: organizers.userId });
  } else if (name && (row.isOwner || row.userId === null)) {
    // An invited account's name is theirs to change; the owner's and a
    // phone-only organizador's are the host's.
    await db
      .update(organizers)
      .set({ fullName: name, updatedAt: new Date() })
      .where(and(eq(organizers.eventId, eventId), eq(organizers.id, row.id)));
  }

  const moved = await setResponder(eventId, row.id);
  return moved.error ? { responderPhone: moved.error } : null;
}

/**
 * The pin a pasted Maps link points at, for the small map beside the form.
 * Only Google's own hosts: this opens the link from our server, and a form
 * field must not be a way to make it fetch anything else.
 */
export async function previewPin(
  eventId: string,
  link: string,
): Promise<{ lat: number; lng: number } | null> {
  const guard = await editableEvent(eventId, "event");
  if (!guard.ok) return null;
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/(^|\.)(google\.[a-z.]+|goo\.gl)$/.test(url.hostname)) return null;
  return coordsFromShortLink(url.toString());
}
