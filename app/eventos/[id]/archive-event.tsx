"use client";

import { useState, useTransition } from "react";
import { archiveEvent, unarchiveEvent } from "@/lib/events/actions";

/**
 * Archive and restore.
 *
 * Archiving is deliberately not a delete and the copy says so: the event keeps
 * every message it sent and every answer it got, and comes back untouched.
 */
export function ArchiveEvent({
  eventId,
  archived,
  guestCount,
}: {
  eventId: string;
  archived: boolean;
  guestCount: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = (fn: (id: string) => Promise<{ error?: string }>) =>
    start(async () => {
      const result = await fn(eventId);
      setError(result.error ?? null);
      if (!result.error) setConfirming(false);
    });

  if (archived) {
    return (
      <div className="mt-8 rounded-xl border border-line bg-paper-deep p-5">
        <p className="font-display text-lg text-ink">Este evento está archivado</p>
        <p className="mt-1 text-[0.88rem] leading-relaxed text-ink-muted">
          Puedes verlo completo, pero no cambiarlo. Nada se borró: sus invitados,
          mensajes y confirmaciones siguen aquí.
        </p>
        <button
          type="button"
          onClick={() => run(unarchiveEvent)}
          disabled={pending}
          className="mt-4 rounded-full bg-action px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
        >
          {pending ? "Restaurando…" : "Desarchivar"}
        </button>
        {error && <p className="mt-3 text-[0.88rem] text-danger">{error}</p>}
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-10 text-[0.85rem] text-ink-muted transition-colors hover:text-accent"
      >
        Archivar evento
      </button>
    );
  }

  return (
    <div className="mt-10 rounded-xl border border-line bg-white p-5">
      <p className="text-[0.95rem] text-ink">¿Archivar este evento?</p>
      <p className="mt-1 text-[0.88rem] leading-relaxed text-ink-muted">
        Se guarda tal como está y deja de poder editarse
        {guestCount > 0 && `, incluidos sus ${guestCount} invitados`}. Puedes
        desarchivarlo cuando quieras.
      </p>
      {error && <p className="mt-3 text-[0.88rem] text-danger">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => run(archiveEvent)}
          disabled={pending}
          className="rounded-full bg-action px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
        >
          {pending ? "Archivando…" : "Archivar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-[0.85rem] text-ink-muted hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
