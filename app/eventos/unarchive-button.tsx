"use client";

import { useState, useTransition } from "react";
import { unarchiveEvent } from "@/lib/events/actions";

export function UnarchiveButton({ eventId }: { eventId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await unarchiveEvent(eventId);
            setError(result.error ?? null);
          })
        }
        className="text-[0.85rem] text-ink-muted transition-colors hover:text-accent disabled:opacity-50"
      >
        {pending ? "Restaurando…" : "Desarchivar"}
      </button>
      {error && <p className="mt-2 text-[0.85rem] text-danger">{error}</p>}
    </>
  );
}
