"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { eventFacts, escalations, guests } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { editableEvent } from "./guard";
import { sendTextToGuest } from "@/lib/whatsapp/send";
import { updatedAnswer, unavailableAnswer } from "@/lib/whatsapp/replies";
import { NOT_PUBLIC } from "./knowledge";

/**
 * Correcting an answer that came from a guest's question.
 *
 * Only learned answers are editable here. The questionnaire's answers are
 * projected from `event.details` and rebuilt whenever it is saved, so editing
 * them anywhere but Detalles would be undone the next time it was opened.
 */

export type AnswerState = { error?: string; ok?: string };

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


/** Everyone who asked the question this fact came from. */
async function askersOf(originEscalationId: string | null): Promise<string[]> {
  if (!originEscalationId) return [];
  const escalation = await db.query.escalations.findFirst({
    where: eq(escalations.id, originEscalationId),
  });
  return escalation?.waitingGuestIds ?? [];
}

async function tell(guestIds: string[], message: string): Promise<string> {
  let told = 0;
  const unreachable: string[] = [];

  for (const guestId of guestIds) {
    const guest = await db.query.guests.findFirst({ where: eq(guests.id, guestId) });
    if (!guest) continue;
    const outcome = await sendTextToGuest(guest.id, message, "custom");
    if (outcome.ok) told++;
    else unreachable.push(guest.firstName ?? guest.fullName);
  }

  return [
    told > 0 ? `Le avisamos a ${told} ${told === 1 ? "persona" : "personas"}.` : null,
    unreachable.length > 0
      ? `No pudimos avisarle a ${unreachable.join(", ")}: pasaron más de 24 horas desde su mensaje.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Withdraws an answer already given.
 *
 * The people who asked are told, because they are acting on the old answer —
 * that is what asking was for — and an answer that quietly becomes "not public"
 * leaves them holding something they were told was true.
 */
export async function markAnswerUnavailable(
  eventId: string,
  factId: string,
): Promise<AnswerState> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  const fact = await db.query.eventFacts.findFirst({
    where: and(eq(eventFacts.id, factId), eq(eventFacts.eventId, eventId)),
  });
  if (!fact) return { error: "No encontramos esa respuesta." };
  if (fact.answer === NOT_PUBLIC) return { ok: "Ya estaba marcada así." };

  await db
    .update(eventFacts)
    .set({ answer: NOT_PUBLIC, updatedAt: new Date() })
    .where(eq(eventFacts.id, factId));

  const note = await tell(
    await askersOf(fact.originEscalationId),
    unavailableAnswer(fact.question, NOT_PUBLIC),
  );

  revalidatePath(`/eventos/${eventId}/hechos`);
  return { ok: `Listo. El asistente dirá que no es información pública. ${note}`.trim() };
}

/**
 * Forgets an answer entirely.
 *
 * Nobody is told: this is for a question that should never have become
 * knowledge — a joke, a duplicate, something answered wrongly. The assistant
 * stops citing it, and a guest who asks again escalates as if it were new,
 * which is the right outcome for something we should not have been saying.
 */
export async function discardAnswer(eventId: string, factId: string): Promise<AnswerState> {
  const { orgId } = await requireOrg();

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  const [updated] = await db
    .update(eventFacts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(eventFacts.id, factId), eq(eventFacts.eventId, eventId)))
    .returning({ id: eventFacts.id });

  if (!updated) return { error: "No encontramos esa respuesta." };

  revalidatePath(`/eventos/${eventId}/hechos`);
  return { ok: "Descartada. El asistente ya no la usa." };
}
