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
  | { tool: "escalate_question"; question: string }
  | { tool: "send_location" }
  | { tool: "send_passes" }
  | { tool: "set_companion_name"; name: string };

const locationTool: Anthropic.Tool = {
  name: "send_location",
  description:
    "Send the venue as a WhatsApp location card — a real pin the guest can tap to navigate. Use it when they ask where the party is, for the address, for the location, or how to get there. Send it once and say one short sentence alongside it; do not also paste a link.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  strict: true,
};

const passesTool: Anthropic.Tool = {
  name: "send_passes",
  description:
    "Send the guest their entry pass — the QR code shown at the door, one per person coming. Use it when they ask for their pass, access, QR, code, ticket or entrada, or say they lost or cannot find it. It sends the same codes they already have, never new ones. The result tells you whether it went out or why not; relay that and nothing else.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  strict: true,
};

const companionTool: Anthropic.Tool = {
  name: "set_companion_name",
  description:
    "Write down the name of the person this guest is bringing. Use it the moment they say who is coming with them — «voy con mi esposa Ana», «se llama Luis», or just «Ana López» after you asked. Pass the person's name only, never a whole sentence. Do NOT use it when they say they do not know yet, have not invited anyone yet, or are still deciding: that is not a name, and it would be printed on their pass.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The companion's name as the guest gave it, nothing else.",
      },
    },
    required: ["name"],
    additionalProperties: false,
  },
  strict: true,
};

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
/**
 * What this event's assistant can do.
 *
 * The location card is offered only when the event has coordinates. A tool that
 * always fails teaches the model to stop trusting its own tools, and a guest
 * asking where the party is would get an apology instead of the link that was
 * available all along.
 */
export function agentToolsFor(options: {
  canSendLocation: boolean;
  /** Only events that use QR passes; elsewhere there is nothing to send. */
  canSendPasses: boolean;
  /** Only a guest whose invitation has room for someone else. */
  canNameCompanion: boolean;
}): Anthropic.Tool[] {
  return [
    ...agentTools,
    ...(options.canSendLocation ? [locationTool] : []),
    ...(options.canSendPasses ? [passesTool] : []),
    ...(options.canNameCompanion ? [companionTool] : []),
  ];
}

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
    case "send_location":
      return "Manda la ubicación del lugar como mapa de WhatsApp";
    case "send_passes":
      return "Le manda sus accesos (QR)";
    case "set_companion_name":
      return `Guarda el nombre de su acompañante: “${action.name}”`;
  }
}
