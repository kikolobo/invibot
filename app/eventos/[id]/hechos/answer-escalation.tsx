"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import {
  answerEscalation,
  declineToAnswer,
  dismissEscalation,
  type AnswerState,
} from "@/lib/agent/escalations";
import { Textarea } from "@/components/ui/field";

/**
 * One unanswered question, with the three things an organizer can do about it.
 *
 * Answer it — the answer reaches whoever asked and the assistant learns it.
 * Mark it unavailable — nobody is told, but the assistant stops asking, which
 * is the difference between this and dismissing. Dismiss it — a joke, a wrong
 * number, a duplicate: thrown away, and the next guest to ask starts the loop
 * again, which is right for a question that was never real.
 */
export function AnswerEscalation({
  eventId,
  escalationId,
  question,
  waiting,
}: {
  eventId: string;
  escalationId: string;
  question: string;
  /** The names of everyone waiting, so the organizer can see who is asking. */
  waiting: string[];
}) {
  const [state, formAction, pending] = useActionState<AnswerState, FormData>(
    answerEscalation.bind(null, eventId, escalationId),
    {},
  );
  const [closing, startClosing] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [showWaiting, setShowWaiting] = useState(false);

  const busy = pending || closing;

  const close = (action: (eventId: string, id: string) => Promise<AnswerState>) =>
    startClosing(async () => {
      const result = await action(eventId, escalationId);
      setError(result.error ?? null);
      setDone(result.ok ?? null);
    });

  if (state.ok || done) {
    return (
      <li className="border-t border-line pt-4">
        <p className="text-[0.9rem] text-ink-muted">{question}</p>
        <p className="mt-1 text-[0.88rem] text-ink-soft">{state.ok ?? done}</p>
      </li>
    );
  }

  return (
    <li className="border-t border-line pt-4">
      <p className="text-[0.95rem] text-ink">{question}</p>

      <button
        type="button"
        onClick={() => setShowWaiting((open) => !open)}
        aria-expanded={showWaiting}
        className="mt-1 text-[0.8rem] text-ink-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-accent"
      >
        {waiting.length === 1
          ? "1 invitado espera la respuesta"
          : `${waiting.length} invitados esperan la respuesta`}
      </button>

      {showWaiting && waiting.length > 0 && (
        <ul className="mt-1 text-[0.8rem] text-ink-soft">
          {waiting.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-3">
        <Textarea
          name="answer"
          rows={2}
          placeholder="Contesta como se lo dirías a un invitado…"
          required
        />
        {state.error && <p className="mt-2 text-[0.85rem] text-accent">{state.error}</p>}
        {error && <p className="mt-2 text-[0.85rem] text-accent">{error}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
          >
            {pending ? "Enviando…" : "Contestar"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => close(declineToAnswer)}
            className="text-[0.85rem] text-ink-soft hover:text-ink disabled:opacity-50"
          >
            Info no disponible
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => close(dismissEscalation)}
            className="text-[0.85rem] text-ink-muted hover:text-ink disabled:opacity-50"
          >
            Descartar
          </button>
        </div>
      </form>
    </li>
  );
}
