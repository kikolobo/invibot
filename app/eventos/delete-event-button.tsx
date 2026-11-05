"use client";

import { useState, useTransition } from "react";
import { deleteEvent } from "@/lib/events/actions";

/**
 * Deleting for good, offered only on archived events and only to the owner.
 * The server enforces both; this just says plainly that there is no undo.
 */
export function DeleteEventButton({
  eventId,
  name,
  guestCount,
}: {
  eventId: string;
  name: string;
  guestCount: number;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[0.85rem] text-ink-muted transition-colors hover:text-danger"
      >
        Eliminar
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-danger/40 p-4">
      <p className="text-[0.95rem] text-ink">¿Eliminar “{name}” para siempre?</p>
      <p className="mt-1 text-[0.85rem] leading-relaxed text-ink-muted">
        Se borran
        {guestCount > 0 && ` sus ${guestCount} ${guestCount === 1 ? "invitado" : "invitados"},`} sus
        mensajes, confirmaciones y todo lo que el asistente sabía. No se puede deshacer.
      </p>
      {error && <p className="mt-2 text-[0.85rem] text-danger">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await deleteEvent(eventId);
              setError(result.error ?? null);
            })
          }
          className="rounded-full bg-danger px-4 py-1.5 text-[0.85rem] text-ink-onaction disabled:opacity-50"
        >
          {pending ? "Eliminando…" : "Eliminar para siempre"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          className="text-[0.85rem] text-ink-muted hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
