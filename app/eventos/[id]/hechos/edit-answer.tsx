"use client";

import { useActionState, useState, useTransition } from "react";
import {
  updateGuestAnswer,
  markAnswerUnavailable,
  discardAnswer,
  type AnswerState,
} from "@/lib/events/answers";
import { Textarea } from "@/components/ui/field";
import { buttonStyles } from "./buttons";
import { AskedBy } from "./asked-by";

/**
 * One learned answer, editable in place.
 *
 * Only ever free text: this came from a guest's question, so it belongs to
 * nothing else and there is no stored value to keep it in step with.
 */

export function EditAnswer({
  eventId,
  question,
  answer,
  factId,
  askedBy,
}: {
  eventId: string;
  question: string;
  answer: string;
  factId: string;
  /** Everyone who asked this, for the "i" beside the question. */
  askedBy: string[];
}) {
  const [open, setOpen] = useState(false);
  const [closing, startClosing] = useTransition();
  const [closed, setClosed] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  const close = (action: (eventId: string, factId: string) => Promise<AnswerState>) =>
    startClosing(async () => {
      const result = await action(eventId, factId);
      setCloseError(result.error ?? null);
      if (result.ok) {
        setClosed(result.ok);
        setOpen(false);
      }
    });

  const [state, formAction, pending] = useActionState<AnswerState, FormData>(
    async (prev: AnswerState, formData: FormData) => {
      const result = await updateGuestAnswer(eventId, factId, prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    {},
  );

  if (closed) {
    return (
      <li className="border-t border-line pt-4">
        <p className="text-[0.9rem] text-ink-muted">{question}</p>
        <p className="mt-1 text-[0.88rem] text-ink-soft">{closed}</p>
      </li>
    );
  }

  if (!open) {
    return (
      <li className="group border-t border-line pt-4">
        <p className="text-[0.9rem] text-ink-muted">
          {question}
          <AskedBy names={askedBy} />
        </p>
        <div className="mt-1 flex items-baseline gap-3">
          <p className="min-w-0 whitespace-pre-line text-ink">{answer}</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto shrink-0 text-[0.8rem] text-ink-muted transition-colors hover:text-accent"
          >
            Cambiar
          </button>
        </div>
        {state.ok && <p className="mt-1 text-[0.8rem] text-ink-muted">{state.ok}</p>}
      </li>
    );
  }

  return (
    <li className="border-t border-line pt-4">
      <p className="text-[0.9rem] text-ink-muted">
        {question}
        <AskedBy names={askedBy} />
      </p>
      <form action={formAction} className="mt-2">
        <Textarea name="value" rows={2} defaultValue={answer} />

        {state.error && <p className="mt-2 text-[0.85rem] text-accent">{state.error}</p>}
        {closeError && <p className="mt-2 text-[0.85rem] text-accent">{closeError}</p>}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || closing}
            className={buttonStyles.save}
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending || closing}
            className={buttonStyles.cancel}
          >
            Cancelar
          </button>
          {/* The same two outs an unanswered question has, for the same
              reasons: one withdraws the answer and tells whoever asked, the
              other forgets it and tells nobody. */}
          <button
            type="button"
            onClick={() => close(markAnswerUnavailable)}
            disabled={pending || closing}
            className={buttonStyles.unavailable}
          >
            Info no disponible
          </button>
          <button
            type="button"
            onClick={() => close(discardAnswer)}
            disabled={pending || closing}
            className={buttonStyles.discard}
          >
            Descartar
          </button>
        </div>
      </form>
    </li>
  );
}
