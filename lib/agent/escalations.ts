"use server";

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { escalations, eventFacts, guests } from "@/db/schema";
import { editableEvent } from "@/lib/events/guard";
import { normalizeQuestion } from "@/lib/events/facts";
import { NOT_PUBLIC } from "@/lib/events/knowledge";
import { sendTextToGuest } from "@/lib/whatsapp/send";
import { relayedAnswer, unavailableAnswer } from "@/lib/whatsapp/replies";

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

/**
 * Sends one message to everyone waiting on a question.
 *
 * Shared by answering and by declining to answer: both are outcomes the people
 * who asked were promised, and a relay that lives in only one of them is how
 * the other quietly stops telling anyone.
 */
async function relayToWaiting(
  waitingGuestIds: string[],
  message: string,
): Promise<{ told: number; unreachable: string[] }> {
  let told = 0;
  const unreachable: string[] = [];

  for (const guestId of waitingGuestIds) {
    const guest = await db.query.guests.findFirst({ where: eq(guests.id, guestId) });
    if (!guest) continue;

    const outcome = await sendTextToGuest(guest.id, message, "custom");
    if (outcome.ok) {
      told++;
    } else {
      // Most often the 24-hour window closed while the organizer was away.
      // There is no approved template for an arbitrary answer, so this one
      // cannot be delivered — saying so beats pretending.
      unreachable.push(guest.firstName ?? guest.fullName);
      console.error("[escalation] could not relay", guest.id, outcome.reason);
    }
  }

  return { told, unreachable };
}

/** How the outcome reads back to the organizer. */
function relayNote(told: number, unreachable: string[]): string {
  return [
    told > 0 ? `Le avisamos a ${told} ${told === 1 ? "persona" : "personas"}.` : null,
    unreachable.length > 0
      ? `No pudimos avisarle a ${unreachable.join(", ")}: pasaron más de 24 horas desde su mensaje y WhatsApp ya no nos deja escribirles.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function answerEscalation(
  eventId: string,
  escalationId: string,
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {

  const guard = await editableEvent(eventId, "answer");
  if (!guard.ok) return { error: guard.error };

  const escalation = await db.query.escalations.findFirst({
    where: and(eq(escalations.id, escalationId), eq(escalations.eventId, eventId)),
  });
  if (!escalation) return { error: "No encontramos esa pregunta." };

  const answer = String(formData.get("answer") ?? "").trim();
  if (answer.length < 2) return { error: "Escribe la respuesta." };

  const result = await applyEscalationAnswer(escalation.id, answer);
  if (result.error) return { error: result.error };

  revalidatePath(`/eventos/${eventId}`);
  revalidatePath(`/eventos/${eventId}/hechos`);

  return { ok: result.ok };
}

/**
 * Answering a question, whatever it arrived through.
 *
 * Deliberately free of `requireOrg`: the same answer can come from the
 * organizer typing it in `/hechos` or from the responder replying on WhatsApp,
 * and both must land in exactly the same place — one fact, one relay, one
 * closed escalation. Two implementations would be two chances for the guests
 * waiting on it to be told twice or not at all.
 *
 * Authorization belongs to the callers: the web action checks the session, and
 * the webhook checks that the sender is the responder for that event.
 */
export async function applyEscalationAnswer(
  escalationId: string,
  answer: string,
): Promise<{ error?: string; ok?: string }> {
  const escalation = await db.query.escalations.findFirst({
    where: eq(escalations.id, escalationId),
  });
  if (!escalation) return { error: "No encontramos esa pregunta." };

  // First answer wins. Claimed with a conditional update rather than read
  // and checked: the same question can be answered in the app by the owner,
  // an admin or the responder and on WhatsApp by the responder, and two of
  // them arriving together must not both relay an answer to the guests.
  const [claimed] = await db
    .update(escalations)
    .set({ status: "answered", answerText: answer, answeredAt: new Date() })
    .where(and(eq(escalations.id, escalation.id), ne(escalations.status, "answered")))
    .returning({ id: escalations.id });
  if (!claimed) return { error: "Esa pregunta ya fue contestada." };

  // The fact first: if the relay fails, the assistant has still learned the
  // answer and nobody has to be asked this again.
  const [fact] = await db
    .insert(eventFacts)
    .values({
      eventId: escalation.eventId,
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
  const relay = await relayToWaiting(
    escalation.waitingGuestIds ?? [],
    relayedAnswer(escalation.questionText, answer),
  );

  await db
    .update(escalations)
    .set({ resultingFactId: fact.id })
    .where(eq(escalations.id, escalation.id));

  // Deliberately no `revalidatePath` here. It is request-scoped and throws
  // outside one, and this core runs from the webhook as well as from a page
  // action — the caller that has a request revalidates, the one that does not
  // simply returns.
  return {
    ok: `Guardado. El asistente ya sabe contestarlo. ${relayNote(relay.told, relay.unreachable)}`.trim(),
  };
}

/** Dismisses a question without answering it — a joke, a duplicate, a wrong number. */
export async function dismissEscalation(
  eventId: string,
  escalationId: string,
): Promise<AnswerState> {
  const guard = await editableEvent(eventId, "answer");
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


/**
 * Closing a question by declining to answer it.
 *
 * Different from dismissing: dismissing throws the question away, and the next
 * guest to ask it starts the same loop again. This records the refusal as
 * knowledge, so the assistant answers it itself from then on instead of asking
 * again — which is the point of a question ever reaching this page.
 */
export async function declineToAnswer(
  eventId: string,
  escalationId: string,
): Promise<AnswerState> {

  const guard = await editableEvent(eventId, "answer");
  if (!guard.ok) return { error: guard.error };

  const escalation = await db.query.escalations.findFirst({
    where: and(eq(escalations.id, escalationId), eq(escalations.eventId, eventId)),
  });
  if (!escalation) return { error: "No encontramos esa pregunta." };
  if (escalation.status === "answered") return { error: "Esa pregunta ya fue contestada." };

  const [fact] = await db
    .insert(eventFacts)
    .values({
      eventId,
      question: escalation.questionText,
      answer: NOT_PUBLIC,
      questionNormalized: normalizeQuestion(escalation.questionText),
      source: "organizer",
      visibility: "public",
      originEscalationId: escalation.id,
    })
    .returning({ id: eventFacts.id });

  const relay = await relayToWaiting(
    escalation.waitingGuestIds ?? [],
    unavailableAnswer(escalation.questionText, NOT_PUBLIC),
  );

  await db
    .update(escalations)
    .set({
      status: "answered",
      answerText: NOT_PUBLIC,
      answeredAt: new Date(),
      resultingFactId: fact.id,
    })
    .where(eq(escalations.id, escalation.id));

  revalidatePath(`/eventos/${eventId}/hechos`);
  return {
    ok: `Listo. El asistente contestará que no es información pública. ${relayNote(relay.told, relay.unreachable)}`.trim(),
  };
}

/** Who is waiting on an answer, for the organizer to see before writing one. */
export async function waitingGuestNames(guestIds: string[]): Promise<string[]> {
  if (guestIds.length === 0) return [];
  const rows = await db
    .select({ fullName: guests.fullName })
    .from(guests)
    .where(inArray(guests.id, guestIds));
  return rows.map((row) => row.fullName);
}


/** The names behind a fact, via the escalation it was created from. */
export async function askersOfFact(originEscalationId: string | null): Promise<string[]> {
  if (!originEscalationId) return [];
  const escalation = await db.query.escalations.findFirst({
    where: eq(escalations.id, originEscalationId),
  });
  return waitingGuestNames(escalation?.waitingGuestIds ?? []);
}
