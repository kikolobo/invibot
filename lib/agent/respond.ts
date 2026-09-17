import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, guests, conversations, messages, escalations } from "@/db/schema";
import { applyIntent } from "@/lib/whatsapp/intents";
import { normalizeQuestion } from "@/lib/events/facts";
import { buildContext } from "./context";
import { anthropicFromEnv, runAgentTurn } from "./run";
import type { AgentAction } from "./tools";

type GuestRow = typeof guests.$inferSelect;

/**
 * The assistant, for real.
 *
 * Same prompt, same facts, same tools as the rehearsal on the simulator page —
 * the only difference is the `execute` passed to `runAgentTurn`, which here
 * routes through `applyIntent`, the same function a tapped button uses. A guest
 * who writes "sí voy" ends in exactly the state one who tapped would.
 */

/** Enough thread for the assistant to follow a conversation; not the guest's life story. */
const HISTORY_LIMIT = 20;

export type AgentReply = {
  /** What to send the guest. Empty when the assistant only acted. */
  text: string;
  /** Whether it recorded the guest as coming — the caller owes them a card and a pass. */
  confirmed: boolean;
} | null;

/**
 * Answers one inbound message, or returns null when there is nothing to say.
 *
 * Returning null is the correct outcome more often than it looks: no API key,
 * no open window, an assistant that only called tools. The caller sends nothing
 * rather than inventing filler.
 */
export async function answerGuest(guest: GuestRow, at: Date): Promise<AgentReply> {
  const client = anthropicFromEnv();
  if (!client) return null;

  const event = await db.query.events.findFirst({ where: eq(events.id, guest.eventId) });
  if (!event) return null;

  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.guestId, guest.id), eq(conversations.channel, "whatsapp")),
  });
  if (!conversation) return null;

  const thread = await db
    .select({ direction: messages.direction, body: messages.body })
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt));

  // Template sends are stored as "[template:nombre]", which tells the assistant
  // nothing and would read as gibberish in its own history. The invitation's
  // content is already in the system prompt.
  const history: Anthropic.MessageParam[] = thread
    .slice(-HISTORY_LIMIT)
    .filter((row) => row.body && !row.body.startsWith("[template:"))
    .map((row) => ({
      role: row.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: row.body!,
    }));

  // The API requires the exchange to start with the guest and end with them.
  while (history.length > 0 && history[0].role !== "user") history.shift();
  if (history.length === 0 || history[history.length - 1].role !== "user") return null;

  const { systemPrompt } = await buildContext(event, guest);

  let confirmed = false;

  const result = await runAgentTurn(client, systemPrompt, history, (action) => {
    if (action.tool === "confirm_attendance") confirmed = true;
    return perform(guest, conversation.id, action, at);
  });

  if ("error" in result) {
    console.error("[agent] turn failed", guest.id, result.error);
    return null;
  }

  // Returned even with no text: a confirmation still owes the guest their pass,
  // and an early exit on empty text is how that went missing the first time.
  return { text: result.reply.trim(), confirmed };
}

/**
 * Carries out what the assistant asked for.
 *
 * Every state change goes through `applyIntent` rather than writing to `guests`
 * here, so the rules that matter — clamping a companion to what was offered,
 * writing the cross-event suppression on an opt-out — live in one place and
 * cannot drift between the button path and this one.
 */
async function perform(
  guest: GuestRow,
  conversationId: string,
  action: AgentAction,
  at: Date,
): Promise<string> {
  switch (action.tool) {
    case "confirm_attendance": {
      // `applyIntent` already clamps the stored seats, so a companion invented
      // here was never written — but the model went on to tell the guest "los
      // dos quedan registrados", and someone arrives with a person who has no
      // place. The correction has to reach the sentence, not just the row.
      const companion = action.companion && guest.partySizeAllowed >= 2;
      await applyIntent(guest, companion ? "rsvp_yes_plus_one" : "rsvp_yes_solo", at);
      if (action.companion && !companion) {
        return [
          "Registrado, pero SOLO el invitado: su invitación no incluye acompañante.",
          "No le prometas un lugar extra. Dile con tacto que su invitación es",
          "individual y que lo consultas con el anfitrión si insiste.",
        ].join(" ");
      }
      return "Registrado. El invitado queda confirmado.";
    }

    case "decline_attendance":
      await applyIntent(guest, "rsvp_no", at);
      return "Registrado. El invitado queda como que no asistirá.";

    case "opt_out":
      await applyIntent(guest, "opt_out", at);
      return "Registrado. No se le enviarán más mensajes.";

    case "escalate_question":
      await recordEscalation(guest, conversationId, action.question);
      return "Enviado al anfitrión. Avísale al invitado que le confirmas en cuanto sepas.";
  }
}

/**
 * Files a question for the organizer.
 *
 * Deduplicated on the normalized question, which is why the column exists: six
 * guests asking about children is one thing to ask and six people to tell, not
 * six identical pings. Everyone waiting is kept so the answer can reach all of
 * them.
 *
 * This runs before any organizer notification exists — the assistant tells the
 * guest it asked, and this is what makes that true rather than a promise into
 * the void. The open questions are shown to the organizer in the app.
 */
async function recordEscalation(
  guest: GuestRow,
  conversationId: string,
  question: string,
): Promise<void> {
  const normalized = normalizeQuestion(question);

  const existing = await db.query.escalations.findFirst({
    where: and(
      eq(escalations.eventId, guest.eventId),
      eq(escalations.questionNormalized, normalized),
      eq(escalations.status, "open"),
    ),
  });

  if (existing) {
    if (!existing.waitingGuestIds.includes(guest.id)) {
      await db
        .update(escalations)
        .set({ waitingGuestIds: [...existing.waitingGuestIds, guest.id] })
        .where(eq(escalations.id, existing.id));
    }
    return;
  }

  await db
    .insert(escalations)
    .values({
      eventId: guest.eventId,
      conversationId,
      questionText: question,
      questionNormalized: normalized,
      waitingGuestIds: [guest.id],
    })
    // Two guests asking the same thing at the same moment race here; the
    // index makes the loser a no-op rather than a duplicate ping.
    .onConflictDoNothing();
}

/** Open questions for an event, newest first. */
export async function openEscalations(eventId: string) {
  return db
    .select()
    .from(escalations)
    .where(and(eq(escalations.eventId, eventId), eq(escalations.status, "open")))
    .orderBy(sql`${escalations.createdAt} desc`);
}
