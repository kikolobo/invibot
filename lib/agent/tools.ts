import type Anthropic from "@anthropic-ai/sdk";

/**
 * What the assistant is allowed to do, as opposed to say.
 *
 * Each one mirrors something `applyIntent` already does for button taps, so a
 * guest who writes "sí voy" ends up in exactly the same state as one who tapped
 * the button. The rules that matter — clamping the companion to what the
 * organizer offered, writing the cross-event suppression — stay in that one
 * place rather than being restated in a prompt the model may or may not follow.
 */

export type AgentAction =
  | { tool: "confirm_attendance"; companion: boolean }
  | { tool: "decline_attendance" }
  | { tool: "opt_out" }
  | { tool: "escalate_question"; question: string };

export const agentTools: Anthropic.Tool[] = [
  {
    name: "confirm_attendance",
    description:
      "Record that this guest is coming. Use it the moment they say so in any words — 'sí voy', 'ahí estaré', 'cuenta conmigo'. Set companion to true only if they say someone is coming with them, and only if their invitation includes a companion.",
    input_schema: {
      type: "object",
      properties: {
        companion: {
          type: "boolean",
          description: "True if they are bringing the one companion their invitation allows.",
        },
      },
      required: ["companion"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "decline_attendance",
    description:
      "Record that this guest cannot come. Only when they actually say they cannot — 'no puedo', 'no voy a llegar'. Not for hesitation: 'no sé si pueda' or 'déjame ver' is not a decline, and marking it as one loses a guest who was still deciding.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: "opt_out",
    description:
      "The guest asked to stop receiving messages. This is permanent and applies to every event on the platform, so use it only on a clear request to stop — not on annoyance or a complaint.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: "escalate_question",
    description:
      "The guest asked something the organizer has not answered. Use this instead of guessing, every time. The organizer is asked once on their own WhatsApp and the answer comes back to the guest.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The guest's question, rewritten as one clear question for the organizer.",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
    strict: true,
  },
];

/** Human-readable, for the organizer watching the simulator. */
export function describeAction(action: AgentAction): string {
  switch (action.tool) {
    case "confirm_attendance":
      return action.companion ? "Registra: asiste con acompañante" : "Registra: asiste";
    case "decline_attendance":
      return "Registra: no podrá asistir";
    case "opt_out":
      return "Registra: pidió no recibir más mensajes";
    case "escalate_question":
      return `Te preguntaría: “${action.question}”`;
  }
}
