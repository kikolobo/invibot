"use client";

import { useActionState, useState, useTransition } from "react";
import { answerEscalation, dismissEscalation, type AnswerState } from "@/lib/agent/escalations";
import { Textarea } from "@/components/ui/field";

/**
 * One unanswered question, with the box that answers it.
 *
 * The answer goes two places at once: to the guests who asked, and into the
 * event's facts so the assistant fields it alone next time. The second is the
 * one that compounds.
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
  waiting: number;
}) {
  const [state, formAction, pending] = useActionState<AnswerState, FormData>(
    answerEscalation.bind(null, eventId, escalationId),
    {},
  );
  const [dismissing, startDismiss] = useTransition();
  const [dismissError, setDismissError] = useState<string | null>(null);

  if (state.ok) {
    return (
      <li className="border-t border-line pt-4">
        <p className="text-[0.9rem] text-ink-muted">{question}</p>
        <p className="mt-1 text-[0.88rem] text-ink-soft">{state.ok}</p>
      </li>
    );
  }

  return (
    <li className="border-t border-line pt-4">
      <p className="text-[0.95rem] text-ink">{question}</p>
      <p className="mt-1 text-[0.8rem] text-ink-muted">
        {waiting === 1
          ? "1 invitado espera la respuesta"
          : `${waiting} invitados esperan la respuesta`}
      </p>

      <form action={formAction} className="mt-3">
        <Textarea
          name="answer"
          rows={2}
          placeholder="Contesta como se lo dirías a un invitado…"
          required
        />
        {state.error && <p className="mt-2 text-[0.85rem] text-accent">{state.error}</p>}
        {dismissError && <p className="mt-2 text-[0.85rem] text-accent">{dismissError}</p>}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || dismissing}
            className="rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
          >
            {pending ? "Enviando…" : "Contestar"}
          </button>
          <button
            type="button"
            disabled={pending || dismissing}
            onClick={() =>
              startDismiss(async () => {
                const result = await dismissEscalation(eventId, escalationId);
                setDismissError(result.error ?? null);
              })
            }
            className="text-[0.85rem] text-ink-muted hover:text-ink disabled:opacity-50"
          >
            {dismissing ? "Descartando…" : "Descartar"}
          </button>
        </div>
      </form>
    </li>
  );
}
