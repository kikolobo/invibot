"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addOrganizer,
  removeOrganizer,
  setResponder,
  type OrganizerState,
} from "@/lib/organizers/actions";

export type OrganizerRow = {
  id: string;
  fullName: string;
  phoneE164: string;
  isResponder: boolean;
};

/**
 * Who runs the event, as phone numbers.
 *
 * Two different powers on one screen, and the copy has to keep them apart:
 * everybody here can ask us for counts on WhatsApp, and exactly one of them
 * receives guests' questions. The second is a radio button rather than a
 * checkbox for the reason a radio exists — one of them is always it.
 */
export function Organizadores({
  eventId,
  rows,
  staffCode,
}: {
  eventId: string;
  rows: OrganizerRow[];
  staffCode: string | null;
}) {
  const [state, formAction, pending] = useActionState<OrganizerState, FormData>(
    addOrganizer.bind(null, eventId),
    {},
  );
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<OrganizerState>) =>
    start(async () => {
      const result = await fn();
      setError(result.error ?? null);
    });

  return (
    <section className="mt-8">
      <p className="max-w-2xl text-[0.9rem] leading-relaxed text-ink-muted">
        Desde su WhatsApp pueden preguntarme
        <code className="mx-1 rounded bg-paper-deep px-1.5 py-0.5 text-[0.85em]">/confirmados</code>,
        <code className="mx-1 rounded bg-paper-deep px-1.5 py-0.5 text-[0.85em]">/invitados</code> o
        <code className="mx-1 rounded bg-paper-deep px-1.5 py-0.5 text-[0.85em]">/cancelados</code>
        y les contesto al momento.
      </p>

      {rows.length > 0 && (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <label className="flex flex-1 cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name="responder"
                  checked={row.isResponder}
                  onChange={() => run(() => setResponder(eventId, row.id))}
                  disabled={busy}
                  className="size-4 shrink-0 accent-[var(--accent)]"
                  aria-label={`${row.fullName} contesta las preguntas`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[0.95rem] text-ink">{row.fullName}</span>
                  <span className="block truncate text-[0.8rem] text-ink-muted">
                    {row.phoneE164}
                    {row.isResponder && " · contesta las preguntas de los invitados"}
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => run(() => removeOrganizer(eventId, row.id))}
                disabled={busy}
                className="text-[0.82rem] text-ink-muted transition-colors hover:text-accent disabled:opacity-50"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 1 && (
        <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-muted">
          La pregunta de un invitado le llega sólo a la persona marcada. Si llegara a todos,
          el mismo invitado recibiría tres respuestas distintas.
        </p>
      )}

      <form action={formAction} className="mt-6 flex flex-wrap items-start gap-3">
        <input
          name="fullName"
          placeholder="Nombre"
          required
          className="min-w-[10rem] flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[0.9rem] text-ink"
        />
        <input
          name="phone"
          type="tel"
          placeholder="Teléfono con WhatsApp"
          required
          className="min-w-[12rem] flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[0.9rem] text-ink"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
        >
          {pending ? "Agregando…" : "Agregar"}
        </button>
      </form>

      {state.error && <p className="mt-3 text-[0.88rem] text-accent">{state.error}</p>}
      {state.ok && <p className="mt-3 text-[0.88rem] text-ink-soft">{state.ok}</p>}
      {error && <p className="mt-3 text-[0.88rem] text-accent">{error}</p>}

      {staffCode && rows.length > 0 && (
        <p className="mt-6 text-[0.8rem] leading-relaxed text-ink-muted">
          Clave de este evento para tu equipo:{" "}
          <code className="rounded bg-paper-deep px-1.5 py-0.5">{staffCode.toUpperCase()}</code>.
          Va en las preguntas que les mando, para que sepan de cuál evento se trata cuando
          llevan varios. No es la liga de registro y no sirve para inscribirse.
        </p>
      )}
    </section>
  );
}
