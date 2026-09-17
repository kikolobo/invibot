"use client";

import { useState, useTransition } from "react";
import { setQrEnabled } from "@/lib/events/actions";

/**
 * Whether confirmed guests get a QR for the door.
 *
 * Off by default, and worth leaving off for most parties: a code arriving
 * unasked reads as a ticketing system, which is not what a garden full of
 * thirty friends wants.
 */
export function QrSettings({
  eventId,
  enabled,
}: {
  eventId: string;
  enabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await setQrEnabled(eventId, !enabled);
            setError(result.error ?? null);
            setMessage(result.ok ?? null);
          })
        }
        className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[0.8rem] text-ink-soft transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        <span
          className={`grid size-4 place-items-center rounded border ${
            enabled ? "border-accent bg-accent text-paper" : "border-line"
          }`}
          aria-hidden="true"
        >
          {enabled && (
            <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2.5 6.5 5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        {pending ? "Guardando…" : "Código de acceso (QR)"}
      </button>

      {(message || error) && (
        <p className={`mt-2 text-[0.8rem] ${error ? "text-accent" : "text-ink-muted"}`}>
          {error ?? message}
        </p>
      )}
    </div>
  );
}
