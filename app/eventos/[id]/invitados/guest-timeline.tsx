"use client";

import { useEffect, useState } from "react";
import { Overlay } from "@/components/ui/overlay";
import { guestTimeline } from "@/lib/guests/timeline";
import type { TimelineEntry } from "@/lib/guests/timeline-assemble";

/**
 * One guest's history, in a panel that slides in from the right.
 *
 * A panel rather than a window: a real popup is blocked by every browser worth
 * having, and this has to open from a click inside a table.
 *
 * Loaded when it opens, never with the table. Forty guests times their whole
 * conversation is a page that takes seconds to render for a panel nobody has
 * asked for yet.
 */

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const when = (iso: string) => dateFmt.format(new Date(iso));

export function GuestTimeline({
  eventId,
  guest,
  onClose,
}: {
  eventId: string;
  guest: { id: string; fullName: string };
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // No reset here: the panel is mounted fresh per guest and unmounted on close,
  // so the initial state is already the empty one.
  useEffect(() => {
    let live = true;
    guestTimeline(eventId, guest.id).then((result) => {
      if (!live) return;
      if (result.error) setError(result.error);
      else setEntries(result.entries);
    });
    return () => {
      live = false;
    };
  }, [eventId, guest.id]);

  return (
    <Overlay onClose={onClose} align="right" title={guest.fullName} subtitle="Historial completo">
      {error && <p className="text-[0.88rem] text-ink-soft">{error}</p>}
      {!error && entries === null && <p className="text-[0.88rem] text-ink-muted">Cargando…</p>}
      {entries?.length === 0 && (
        <p className="text-[0.88rem] text-ink-muted">
          Todavía no hay nada registrado de esta persona.
        </p>
      )}

      <ol className="space-y-3">
        {entries?.map((entry, index) => (
          <li key={`${entry.at}-${index}`} className="border-l-2 border-line pl-3">
            <p className="text-[0.75rem] text-ink-muted">{when(entry.at)}</p>
            <p
              className={
                entry.kind === "guest"
                  ? "text-[0.88rem] text-ink"
                  : "text-[0.88rem] text-ink-soft"
              }
            >
              {entry.label}
              {entry.text && <span className="text-ink">: «{entry.text}»</span>}
            </p>

            {entry.replies?.map((reply, replyIndex) => (
              <p
                key={`${reply.at}-${replyIndex}`}
                className="mt-1 ml-4 border-l border-line pl-3 text-[0.84rem] text-ink-muted"
              >
                Respondimos: {reply.text}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </Overlay>
  );
}
