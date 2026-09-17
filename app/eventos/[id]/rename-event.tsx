"use client";

import { useActionState, useState } from "react";
import { renameEvent, type ActionState } from "@/lib/events/actions";
import { Input } from "@/components/ui/field";

/**
 * The event name, editable in place.
 *
 * The name reaches guests inside every invitation, so a typo in it is a typo
 * in something already on people's phones. Fixing it here does not recall
 * those — but it does fix every message still to come.
 */
export function RenameEvent({ eventId, name }: { eventId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState & { ok?: string }, FormData>(
    async (prev: ActionState, formData: FormData) => {
      const result = await renameEvent(eventId, prev, formData);
      if (result.ok) setEditing(false);
      return result;
    },
    {},
  );

  if (!editing) {
    return (
      <div className="mt-4 flex items-start gap-3">
        <h1 className="font-display text-4xl leading-tight text-ink sm:text-5xl">{name}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 shrink-0 text-[0.85rem] text-accent hover:underline"
          aria-label="Cambiar el nombre del evento"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-4">
      <Input
        name="name"
        defaultValue={name}
        maxLength={120}
        autoFocus
        className="font-display text-2xl"
      />
      {state.error && <p className="mt-2 text-[0.88rem] text-accent">{state.error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="text-[0.85rem] text-ink-muted hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
