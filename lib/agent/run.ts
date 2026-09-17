import Anthropic from "@anthropic-ai/sdk";
import { agentTools, type AgentAction } from "./tools";

/**
 * One turn of the guest conversation.
 *
 * Deliberately not streaming and deliberately short: the output is a WhatsApp
 * message, so `max_tokens` is set to what a message can be rather than to the
 * usual generous default. Thinking counts against it, hence the headroom.
 */

/** Model choice is a per-deployment decision; see SERVICES.md on cost per event. */
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

/**
 * A guest asking about parking needs no deliberation, and effort is the first
 * cost lever. Raise it if escalation judgment turns out to be the weak point —
 * deciding *not* to answer is the hard call in this prompt.
 */
const EFFORT = "low";

/** Guards a runaway loop. Two rounds is enough for "call a tool, then reply". */
const MAX_ROUNDS = 4;

export type AgentTurn = {
  /** What to send the guest. Empty when the model only called tools. */
  reply: string;
  /** Every tool the model asked for, in order. */
  actions: AgentAction[];
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

export type AgentFailure = { error: string };

export function anthropicFromEnv(): Anthropic | null {
  // Mirrors `r2FromEnv` and `configFromEnv`: unconfigured is a disabled
  // feature, never a crash.
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

/**
 * Runs the model until it stops asking for tools.
 *
 * `execute` decides what a tool call actually does. The simulator passes one
 * that changes nothing and only records the intent; the WhatsApp path will pass
 * one that calls into `applyIntent`. The loop itself does not know the
 * difference, which is what makes the simulator a real rehearsal rather than a
 * mock-up.
 */
export async function runAgentTurn(
  client: Anthropic,
  systemPrompt: string,
  history: Anthropic.MessageParam[],
  execute: (action: AgentAction) => Promise<string>,
): Promise<AgentTurn | AgentFailure> {
  const messages: Anthropic.MessageParam[] = [...history];
  const actions: AgentAction[] = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        output_config: { effort: EFFORT },
        // The prompt and the event's facts are identical for every guest of
        // this event, so they are the cacheable prefix. Watch
        // `cache_read_input_tokens`: below the model's minimum prefix this
        // silently does nothing.
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        tools: agentTools,
        messages,
      });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        return { error: "El asistente está saturado ahorita. Inténtalo de nuevo en un momento." };
      }
      if (error instanceof Anthropic.AuthenticationError) {
        return { error: "La llave de Anthropic no es válida." };
      }
      // A 400 is a configuration or billing problem, not a blip — "no pudimos
      // contactar al asistente" sends someone looking at their network when
      // the real answer is that the account is out of credit. This surface is
      // the organizer's own, so the provider's wording is the useful thing to
      // show; the guest-facing path never renders these.
      if (error instanceof Anthropic.BadRequestError) {
        console.error("[agent] rejected", error.message);
        return { error: `Anthropic rechazó la petición: ${error.message}` };
      }
      console.error("[agent] request failed", error);
      return { error: "No pudimos contactar al asistente." };
    }

    usage.input += response.usage.input_tokens;
    usage.output += response.usage.output_tokens;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;

    // Checked before reading content, which is empty on a refusal.
    if (response.stop_reason === "refusal") {
      return { error: "El asistente no pudo responder a eso." };
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (response.stop_reason !== "tool_use") {
      return { reply: text, actions, usage };
    }

    // Thinking blocks come back with the rest of the content and must be
    // echoed unchanged when the conversation continues on the same model.
    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      // Never string-match the serialized input; it is already parsed here.
      const action = { tool: block.name, ...(block.input as object) } as AgentAction;
      actions.push(action);
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: await execute(action),
      });
    }

    // Every result goes back in one user message, or the model learns to stop
    // making parallel calls.
    messages.push({ role: "user", content: results });
  }

  return { error: "El asistente se quedó dando vueltas sin contestar." };
}
