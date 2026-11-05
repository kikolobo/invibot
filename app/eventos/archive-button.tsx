"use client";

import { useState, useTransition } from "react";
import { archiveEvent } from "@/lib/events/actions";

/**
 * Archiving from the list. One confirming step, inline, because the row is
 * small and the action is fully reversible from the archive.
 */
export function ArchiveButton({ eventId }: { eventId: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[0.85rem] text-ink-muted transition-colors hover:text-accent"
      >
        Archivar
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-3">
      <span className="text-[0.85rem] text-ink-soft">¿Archivar? Deja de poder editarse.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await archiveEvent(eventId);
            setError(result.error ?? null);
            if (!result.error) setConfirming(false);
          })
        }
        className="text-[0.85rem] font-medium text-ink transition-colors hover:text-accent disabled:opacity-50"
      >
        {pending ? "Archivando…" : "Sí, archivar"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(false)}
        className="text-[0.85rem] text-ink-muted hover:text-ink disabled:opacity-50"
      >
        Cancelar
      </button>
      {error && <span className="w-full text-[0.85rem] text-danger">{error}</span>}
    </span>
  );
}
