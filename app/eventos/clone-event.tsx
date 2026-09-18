"use client";

import { useActionState, useState } from "react";
import { cloneEvent, type ActionState } from "@/lib/events/actions";
import { Field, Input } from "@/components/ui/field";

/**
 * Copying an event to plan the next one.
 *
 * The date is asked for rather than inherited: the copy is for a party that
 * has not happened, and leaving last year's date in place is the one mistake
 * this form exists to prevent.
 */
export function CloneEvent({
  eventId,
  name,
  guestCount,
}: {
  eventId: string;
  name: string;
  guestCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    cloneEvent.bind(null, eventId),
    {},
  );

  const err = (field: string) => state.fieldErrors?.[field];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[0.85rem] text-ink-muted transition-colors hover:text-accent"
      >
        Duplicar
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-4 space-y-4 rounded-xl border border-line bg-paper-deep p-5">
      <p className="font-display text-lg text-ink">Duplicar “{name}”</p>

      <Field label="Nombre del nuevo evento" error={err("name")}>
        <Input name="name" defaultValue={`${name} (copia)`} maxLength={120} required />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha" error={err("date")}>
          <Input name="date" type="date" required />
        </Field>
        <Field label="Hora" error={err("time")}>
          <Input name="time" type="time" required />
        </Field>
      </div>

      {guestCount > 0 && (
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="copyGuests"
            defaultChecked
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="text-[0.95rem] font-medium text-ink">
              Copiar la lista de invitados
            </span>
            <span className="block text-[0.82rem] text-ink-muted">
              {guestCount} {guestCount === 1 ? "persona" : "personas"}, con sus grupos y pases.
              Nadie queda como invitado ni confirmado: es una lista nueva.
            </span>
          </span>
        </label>
      )}

      <p className="text-[0.82rem] leading-relaxed text-ink-muted">
        Se copian también las respuestas del cuestionario y lo que el asistente ya sabe
        contestar. No se copian mensajes ni confirmaciones.
      </p>

      {state.error && <p className="text-[0.88rem] text-danger">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-action px-5 py-2 text-[0.85rem] text-ink-onaction disabled:opacity-50"
        >
          {pending ? "Duplicando…" : "Duplicar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-[0.85rem] text-ink-muted hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
