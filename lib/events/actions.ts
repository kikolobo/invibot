"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { customAlphabet } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { events, eventFacts } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { eventKinds } from "./kinds";
import { emptyEventDetails, eventDetailsSchema } from "./details";
import { questionsFor, type Answers } from "./questions";
import { answersToFacts, setPath } from "./facts";

const slugId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 6);

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
    rsvpRequired: z.boolean().default(true),
    allowPlusOnes: z.boolean().default(false),
    maxPartySize: z.coerce.number().int().min(1).max(20).default(1),
  })
  .refine((v) => v.allowPlusOnes || v.maxPartySize === 1, {
    message: "Si no permites acompañantes, el máximo debe ser 1",
    path: ["maxPartySize"],
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
    rsvpRequired: formData.get("rsvpRequired") === "on",
    allowPlusOnes: formData.get("allowPlusOnes") === "on",
    maxPartySize: formData.get("maxPartySize") || 1,
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
      rsvpRequired: v.rsvpRequired,
      allowPlusOnes: v.allowPlusOnes,
      maxPartySize: v.allowPlusOnes ? v.maxPartySize : 1,
      details: emptyEventDetails(),
    })
    .returning();

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

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.orgId, orgId)),
  });
  if (!event) return { error: "No encontramos ese evento." };

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
