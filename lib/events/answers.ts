"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { events, eventFacts, escalations, guests } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { editableEvent } from "./guard";
import { questionsFor, type Question } from "./questions";
import { answersToFacts, detailsToAnswers, setPath } from "./facts";
import { eventDetailsSchema } from "./details";
import { sendTextToGuest } from "@/lib/whatsapp/send";
import { updatedAnswer } from "@/lib/whatsapp/replies";

/**
 * Editing an answer after the fact.
 *
 * Two kinds of answer live side by side and they cannot be edited the same way.
 * A catalogue answer is *projected* from `event.details` — the facts table is
 * rebuilt from it whenever the questionnaire is saved — so editing the fact row
 * would be undone the next time someone touched Detalles. Those edits are
 * written back to `details` and the facts re-projected, which is why this reads
 * the question's type instead of taking a string.
 *
 * A learned answer came from a guest's question and belongs to nothing else, so
 * it is edited in place — and the people who asked are told it changed.
 */

export type AnswerState = { error?: string; ok?: string };

/** Parses one submitted value the way the questionnaire would. */
function readValue(question: Question, formData: FormData): unknown {
  const raw = formData.get("value");

  if (question.type === "boolean") {
    if (raw === "si") return true;
    if (raw === "no") return false;
    return undefined;
  }

  if (question.type === "urls") {
    return String(raw ?? "")
      .split(/[\n,]/)
      .map((url) => url.trim())
      .filter(Boolean);
  }

  const text = String(raw ?? "").trim();
  return text === "" ? undefined : text;
}

export async function updateCatalogAnswer(
  eventId: string,
  questionKey: string,
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };
  const event = guard.event;

  const question = questionsFor(event.kind).find((q) => q.key === questionKey);
  if (!question) return { error: "Esa pregunta no existe para este evento." };

  const value = readValue(question, formData);

  // Merge into the answers the event already has, so re-projecting rebuilds
  // every fact rather than only this one.
  const answers = detailsToAnswers(event.kind, event.details);
  if (value === undefined) delete answers[questionKey];
  else answers[questionKey] = value;

  const nested: Record<string, unknown> = structuredClone(event.details);
  setPath(nested, questionKey, value ?? null);

  const details = eventDetailsSchema.safeParse(nested);
  if (!details.success) return { error: "Esa respuesta no es válida." };

  const facts = answersToFacts(event.kind, answers);

  await db.transaction(async (tx) => {
    await tx
      .update(events)
      .set({ details: details.data, updatedAt: new Date() })
      .where(eq(events.id, eventId));

    // Same replace-wholesale the questionnaire does. Learned facts are left
    // alone: they are not projected from anything.
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

  revalidatePath(`/eventos/${eventId}/hechos`);
  revalidatePath(`/eventos/${eventId}/detalles`);
  return { ok: "Actualizado. También quedó guardado en los detalles del evento." };
}

/**
 * Corrects an answer that came from a guest's question.
 *
 * Whoever asked is told it changed. They acted on the first answer — that is
 * what asking was for — so a silent correction leaves them with the wrong
 * instruction and no way to know it.
 */
export async function updateGuestAnswer(
  eventId: string,
  factId: string,
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  const fact = await db.query.eventFacts.findFirst({
    where: and(eq(eventFacts.id, factId), eq(eventFacts.eventId, eventId)),
  });
  if (!fact) return { error: "No encontramos esa respuesta." };

  const answer = String(formData.get("value") ?? "").trim();
  if (answer.length < 2) return { error: "Escribe la respuesta." };
  if (answer === fact.answer) return { ok: "Sin cambios." };

  await db
    .update(eventFacts)
    .set({ answer, updatedAt: new Date() })
    .where(eq(eventFacts.id, factId));

  // Everyone who asked the question this answer came from.
  let told = 0;
  const unreachable: string[] = [];

  if (fact.originEscalationId) {
    const escalation = await db.query.escalations.findFirst({
      where: eq(escalations.id, fact.originEscalationId),
    });

    for (const guestId of escalation?.waitingGuestIds ?? []) {
      const guest = await db.query.guests.findFirst({ where: eq(guests.id, guestId) });
      if (!guest) continue;

      const outcome = await sendTextToGuest(
        guest.id,
        updatedAnswer(fact.question, answer),
        "custom",
      );
      if (outcome.ok) told++;
      else unreachable.push(guest.firstName ?? guest.fullName);
    }
  }

  revalidatePath(`/eventos/${eventId}/hechos`);

  const parts = [
    told > 0 ? `Le avisamos a ${told} ${told === 1 ? "persona" : "personas"}.` : null,
    unreachable.length > 0
      ? `No pudimos avisarle a ${unreachable.join(", ")}: pasaron más de 24 horas desde su mensaje.`
      : null,
  ].filter(Boolean);

  return { ok: `Actualizado. ${parts.join(" ")}`.trim() };
}
