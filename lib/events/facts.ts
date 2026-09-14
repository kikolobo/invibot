import type { EventKind } from "./kinds";
import { questionsFor, type Answers, type Question } from "./questions";

/**
 * Projects intake answers into `event_facts` rows.
 *
 * The organizer fills in a form; what gets stored is a set of question/answer
 * pairs phrased the way a guest would ask them. That is what the agent reads,
 * and it is why an answer learned from an escalation is indistinguishable from
 * one captured at intake — both are just rows here.
 */

const STOPWORDS = new Set([
  "a", "al", "algo", "alguna", "alguno", "ante", "con", "cual", "cuando", "de",
  "del", "donde", "el", "en", "es", "esta", "este", "hay", "la", "las", "lo",
  "los", "me", "mi", "mis", "o", "para", "por", "puedo", "que", "se", "si",
  "su", "sus", "tengo", "un", "una", "uno", "y", "ya",
]);

/**
 * Cheap dedupe key: accent-stripped, lowercased, stopworded, sorted. Two guests
 * phrasing the same question differently should collide here before we spend an
 * embedding on them.
 */
export function normalizeQuestion(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .sort()
    .join(" ");
}

export function getPath(obj: Answers, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
    obj,
  );
}

export function setPath(obj: Answers, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop()!;
  let cursor = obj;
  for (const key of keys) {
    if (typeof cursor[key] !== "object" || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key] as Answers;
  }
  cursor[last] = value;
}

/** Renders a raw answer as the sentence the agent will quote. */
export function renderAnswer(question: Question, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  switch (question.type) {
    case "boolean":
      if (question.boolAnswer) {
        return value === true ? question.boolAnswer.yes : question.boolAnswer.no;
      }
      return value === true ? "Sí" : "No";
    case "select": {
      const option = question.options?.find((o) => o.value === value);
      // "undecided" answers are real information for the organizer but useless
      // to a guest — better for the agent to escalate than to say "no sabemos".
      if (value === "undecided" || value === "not_specified") return null;
      return option?.es ?? String(value);
    }
    case "urls":
      return Array.isArray(value) && value.length ? value.join("\n") : null;
    default:
      return String(value).trim() || null;
  }
}

export type FactDraft = {
  key: string;
  question: string;
  answer: string;
  questionNormalized: string;
  visibility: "public" | "internal";
};

/**
 * Turns a flat answers map (dotted keys) into fact rows. Questions that were
 * skipped, left blank, or answered "todavía no sé" produce no row at all —
 * the agent should escalate rather than tell a guest the host doesn't know.
 */
export function answersToFacts(kind: EventKind, answers: Answers): FactDraft[] {
  const facts: FactDraft[] = [];

  for (const question of questionsFor(kind)) {
    if (!question.feedsAgent) continue;
    if (question.appliesWhen && !question.appliesWhen(answers)) continue;

    const rendered = renderAnswer(question, answers[question.key]);
    if (rendered === null) continue;

    const asked = question.factEs ?? question.es;
    facts.push({
      key: question.key,
      question: asked,
      answer: rendered,
      questionNormalized: normalizeQuestion(asked),
      visibility: question.guestVisible ? "public" : "internal",
    });
  }

  return facts;
}
