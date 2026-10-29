import { db } from "@/db";
import { aiUsage } from "@/db/schema";

export type TokenUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };

/**
 * US dollars per million tokens: input, output, cache read, cache write.
 * Cache writes are 1.25× input at the 5-minute TTL the agent uses. A model
 * missing here is recorded at zero cost and named in the log, so the gap is
 * visible instead of a guess.
 */
const PRICES: Record<string, [number, number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-opus-5": [5, 25, 0.5, 6.25],
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "claude-sonnet-5": [2, 10, 0.2, 2.5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
};

export function costMicroUsd(model: string, usage: TokenUsage): number {
  const price = PRICES[model];
  if (!price) {
    console.warn("[ai] no price for model", model);
    return 0;
  }
  const [input, output, read, write] = price;
  // $/M tokens × tokens = micro-dollars, exactly.
  return Math.round(
    usage.input * input + usage.output * output + usage.cacheRead * read + usage.cacheWrite * write,
  );
}

/**
 * One line per call to Claude. Never fatal: losing a usage line must not lose
 * the guest their answer.
 */
export async function recordUsage(entry: {
  source: "guest_reply" | "simulator" | "name_split";
  model: string;
  usage: TokenUsage;
  eventId?: string | null;
  guestId?: string | null;
}) {
  try {
    await db.insert(aiUsage).values({
      source: entry.source,
      model: entry.model,
      eventId: entry.eventId ?? null,
      guestId: entry.guestId ?? null,
      inputTokens: entry.usage.input,
      outputTokens: entry.usage.output,
      cacheReadTokens: entry.usage.cacheRead,
      cacheWriteTokens: entry.usage.cacheWrite,
      costMicroUsd: costMicroUsd(entry.model, entry.usage),
    });
  } catch (error) {
    console.error("[ai] could not record usage", error);
  }
}
