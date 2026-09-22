"use server";

import type Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, guests } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { buildContext } from "./context";
import { anthropicFromEnv, runAgentTurn } from "./run";
import { describeAction, type AgentAction } from "./tools";
import { PASSES_SENT } from "./passes";
import { weatherReportFor } from "./weather";

/**
 * The assistant, rehearsing.
 *
 * Identical to what a guest will get — same prompt, same facts, same tools —
 * except that every tool call is recorded instead of performed and no message
 * leaves the building. It exists so the organizer can find out that their
 * assistant invents a dress code *here*, rather than on eighty phones.
 */

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type SimulationResult = {
  reply?: string;
  /** What it would have done, in words, for the organizer to read. */
  actions?: string[];
  error?: string;
  /** Zero cache reads across turns means the prefix is under the model's minimum. */
  usage?: { input: number; output: number; cacheRead: number };
};

/** A conversation long enough to test; past this the organizer is stress-testing, not checking. */
const MAX_TURNS = 30;

export async function simulateReply(
  eventId: string,
  history: ChatTurn[],
): Promise<SimulationResult> {
  const { orgId } = await requireOrg();

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.orgId, orgId)),
  });
  if (!event) return { error: "No encontramos ese evento." };

  const guest = await db.query.guests.findFirst({ where: eq(guests.eventId, eventId) });
  if (!guest) {
    return { error: "Agrega al menos un invitado para poder probar la conversación." };
  }

  const client = anthropicFromEnv();
  if (!client) return { error: "Falta configurar ANTHROPIC_API_KEY en este entorno." };

  const turns = history.slice(-MAX_TURNS).filter((turn) => turn.text.trim().length > 0);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return { error: "Escribe algo primero." };
  }

  const { systemPrompt, tools } = await buildContext(event, guest);

  const messages: Anthropic.MessageParam[] = turns.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));

  const performed: AgentAction[] = [];

  const result = await runAgentTurn(client, systemPrompt, messages, async (action) => {
    performed.push(action);
    // Reports success without doing anything. The model needs to believe the
    // action landed or it will apologise to the guest for a failure that did
    // not happen — and the point is to see the conversation it would really
    // have, not one shaped by the rehearsal.
    switch (action.tool) {
      case "confirm_attendance":
        return "Registrado. El invitado queda confirmado.";
      case "decline_attendance":
        return "Registrado. El invitado queda como que no asistirá.";
      case "opt_out":
        return "Registrado. No se le enviarán más mensajes.";
      case "send_location":
        return "Listo, ya le llegó el mapa con el pin. Contesta exactamente «Aquí está la ubicación», sin agregar nada más.";
      case "escalate_question":
        return "Enviado al anfitrión. Avísale al invitado que le confirmas en cuanto sepas.";
      case "send_passes":
        return PASSES_SENT;
      case "get_weather":
        // A lookup changes nothing, so the rehearsal gets the real forecast.
        return weatherReportFor(event);
      case "set_companion_name":
        return `Guardado: lo acompaña ${action.name}. Confírmaselo en una frase corta y sigue con lo que estaban hablando.`;
    }
  }, tools);

  if ("error" in result) return { error: result.error };

  return {
    reply: result.reply,
    actions: performed.map(describeAction),
    usage: {
      input: result.usage.input,
      output: result.usage.output,
      cacheRead: result.usage.cacheRead,
    },
  };
}
