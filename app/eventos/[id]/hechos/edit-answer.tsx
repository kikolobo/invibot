"use client";

import { useActionState, useState } from "react";
import { updateCatalogAnswer, updateGuestAnswer, type AnswerState } from "@/lib/events/answers";
import { Input, Textarea } from "@/components/ui/field";

/**
 * One answer, editable in place.
 *
 * A catalogue answer is edited with the control the questionnaire uses — a
 * yes/no stays a yes/no — because the value is written back into the event's
 * details, and free text cannot be stored where an option belongs. A learned
 * answer is just words, so it gets a box.
 */

export type EditableQuestion = {
  type: "boolean" | "select" | "text" | "longtext" | "money" | "urls";
  options?: { value: string; label: string }[];
  /** Current raw value, for pre-selecting the control. */
  value?: string;
};

export function EditAnswer({
  eventId,
  question,
  answer,
  /** Catalogue answers carry their key; learned ones carry the fact id. */
  questionKey,
  factId,
  control,
}: {
  eventId: string;
  question: string;
  answer: string;
  questionKey?: string;
  factId?: string;
  control?: EditableQuestion;
}) {
  const [open, setOpen] = useState(false);

  const bound = questionKey
    ? updateCatalogAnswer.bind(null, eventId, questionKey)
    : updateGuestAnswer.bind(null, eventId, factId!);

  const [state, formAction, pending] = useActionState<AnswerState, FormData>(
    async (prev: AnswerState, formData: FormData) => {
      const result = await bound(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    {},
  );

  if (!open) {
    return (
      <li className="group border-t border-line pt-4">
        <p className="text-[0.9rem] text-ink-muted">{question}</p>
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
      <p className="text-[0.9rem] text-ink-muted">{question}</p>
      <form action={formAction} className="mt-2">
        {control?.type === "boolean" ? (
          <div className="flex gap-2">
            {[
              { value: "si", label: "Sí" },
              { value: "no", label: "No" },
            ].map((option) => (
              <label
                key={option.value}
                className="cursor-pointer rounded-full border border-line bg-white px-4 py-1.5 text-[0.85rem] text-ink-soft transition-colors has-checked:border-accent has-checked:bg-accent has-checked:text-paper"
              >
                <input
                  type="radio"
                  name="value"
                  value={option.value}
                  defaultChecked={control.value === option.value}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        ) : control?.type === "select" ? (
          <select
            name="value"
            defaultValue={control.value ?? ""}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[0.95rem] text-ink outline-none focus:border-accent"
          >
            <option value="">Sin responder</option>
            {control.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : control?.type === "longtext" || control?.type === "urls" || !control ? (
          <Textarea name="value" rows={2} defaultValue={answer} />
        ) : (
          <Input name="value" defaultValue={answer} />
        )}

        {state.error && <p className="mt-2 text-[0.85rem] text-accent">{state.error}</p>}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-accent px-4 py-1.5 text-[0.82rem] text-paper disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="text-[0.82rem] text-ink-muted hover:text-ink disabled:opacity-50"
          >
            Cancelar
          </button>
          {!questionKey && (
            <span className="text-[0.78rem] text-ink-muted">
              Le avisamos a quien preguntó
            </span>
          )}
        </div>
      </form>
    </li>
  );
}
