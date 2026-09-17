"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { escalations, eventFacts, guests } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { editableEvent } from "@/lib/events/guard";
import { normalizeQuestion } from "@/lib/events/facts";
import { sendTextToGuest } from "@/lib/whatsapp/send";
import { relayedAnswer } from "@/lib/whatsapp/replies";

/**
 * Answering what the assistant could not.
 *
 * This is the loop that makes an event get better as it runs: a guest asks
 * something nobody wrote down, the organizer answers once, and from then on the
 * assistant answers it without them. The answer is worth more as a fact than as
 * a reply — the reply reaches the people waiting, the fact reaches everyone who
 * asks later.
 */

export type AnswerState = { error?: string; ok?: string };

export async function answerEscalation(
  eventId: string,
  escalationId: string,
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  const escalation = await db.query.escalations.findFirst({
    where: and(eq(escalations.id, escalationId), eq(escalations.eventId, eventId)),
  });
  if (!escalation) return { error: "No encontramos esa pregunta." };
  if (escalation.status === "answered") return { error: "Esa pregunta ya fue contestada." };

  const answer = String(formData.get("answer") ?? "").trim();
  if (answer.length < 2) return { error: "Escribe la respuesta." };

  // The fact first: if the relay fails, the assistant has still learned the
  // answer and nobody has to be asked this again.
  const [fact] = await db
    .insert(eventFacts)
    .values({
      eventId,
      // Null `key` marks a learned fact — this came from a guest's question,
      // not from the intake catalogue.
      question: escalation.questionText,
      answer,
      questionNormalized: normalizeQuestion(escalation.questionText),
      source: "organizer",
      visibility: "public",
      originEscalationId: escalation.id,
    })
    .returning({ id: eventFacts.id });

  // Only the people who asked. `waitingGuestIds` is exactly that set — guests
  // who sent this same question — never the guest list.
  const waiting = escalation.waitingGuestIds ?? [];
  const recipients = waiting.length
    ? await db.select().from(guests).where(inArray(guests.id, waiting))
    : [];

  let delivered = 0;
  const unreachable: string[] = [];

  for (const guest of recipients) {
    const outcome = await sendTextToGuest(
      guest.id,
      relayedAnswer(escalation.questionText, answer),
      "custom",
    );
    if (outcome.ok) {
      delivered++;
    } else {
      // Most often the 24-hour window closed while the organizer was away.
      // There is no approved template for an arbitrary answer, so this one
      // cannot be delivered — saying so is better than pretending.
      unreachable.push(guest.firstName ?? guest.fullName);
      console.error("[escalation] could not relay", guest.id, outcome.reason);
    }
  }

  await db
    .update(escalations)
    .set({
      status: "answered",
      answerText: answer,
      answeredAt: new Date(),
      resultingFactId: fact.id,
    })
    .where(eq(escalations.id, escalation.id));

  revalidatePath(`/eventos/${eventId}`);
  revalidatePath(`/eventos/${eventId}/hechos`);

  const parts = [
    delivered > 0
      ? `Le avisamos a ${delivered} ${delivered === 1 ? "persona" : "personas"}.`
      : null,
    unreachable.length > 0
      ? `No pudimos avisarle a ${unreachable.join(", ")}: pasaron más de 24 horas desde su mensaje y WhatsApp ya no nos deja escribirles.`
      : null,
  ].filter(Boolean);

  return { ok: `Guardado. El asistente ya sabe contestarlo. ${parts.join(" ")}`.trim() };
}

/** Dismisses a question without answering it — a joke, a duplicate, a wrong number. */
export async function dismissEscalation(
  eventId: string,
  escalationId: string,
): Promise<AnswerState> {
  const { orgId } = await requireOrg();
  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  await db
    .update(escalations)
    .set({ status: "dismissed" })
    .where(and(eq(escalations.id, escalationId), eq(escalations.eventId, eventId)));

  revalidatePath(`/eventos/${eventId}/hechos`);
  return { ok: "Descartada." };
}

/** Open questions for an event, oldest first — the longest wait is the most urgent. */
export async function listOpenEscalations(eventId: string) {
  return db
    .select()
    .from(escalations)
    .where(and(eq(escalations.eventId, eventId), eq(escalations.status, "open")))
    .orderBy(desc(escalations.createdAt));
}
