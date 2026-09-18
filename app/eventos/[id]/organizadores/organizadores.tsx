"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addOrganizer,
  removeOrganizer,
  setResponder,
  updateOrganizer,
  type OrganizerState,
} from "@/lib/organizers/actions";

export type OrganizerRow = {
  id: string;
  fullName: string;
  phoneE164: string;
  isResponder: boolean;
};

/**
 * Who runs the event.
 *
 * Two different powers on one screen, and the layout has to keep them apart:
 * everybody here can ask us for counts from their WhatsApp, and exactly one of
 * them receives guests' questions. The second is a radio in its own labelled
 * column — a single pre-checked control with no heading is invisible, which is
 * how the first version managed to ship a picker nobody could find.
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
  const [state, formAction, adding] = useActionState<OrganizerState, FormData>(
    addOrganizer.bind(null, eventId),
    {},
  );
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const run = (fn: () => Promise<OrganizerState>) =>
    start(async () => {
      const result = await fn();
      setError(result.error ?? null);
      if (!result.error) setEditing(null);
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
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 pr-4 text-[0.75rem] font-medium uppercase tracking-wide text-ink-muted">
                  Nombre
                </th>
                <th className="py-2 pr-4 text-[0.75rem] font-medium uppercase tracking-wide text-ink-muted">
                  WhatsApp
                </th>
                <th className="py-2 pr-4 text-center text-[0.75rem] font-medium uppercase tracking-wide text-ink-muted">
                  Contesta
                  <span className="block font-normal normal-case tracking-normal">
                    preguntas de invitados
                  </span>
                </th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) =>
                editing === row.id ? (
                  <EditRow
                    key={row.id}
                    eventId={eventId}
                    row={row}
                    onDone={() => setEditing(null)}
                  />
                ) : (
                  <tr key={row.id}>
                    <td className="py-3 pr-4 text-[0.95rem] text-ink">{row.fullName}</td>
                    <td className="py-3 pr-4 text-[0.88rem] text-ink-soft">{row.phoneE164}</td>
                    <td className="py-3 pr-4 text-center">
                      <input
                        type="radio"
                        name="responder"
                        checked={row.isResponder}
                        onChange={() => run(() => setResponder(eventId, row.id))}
                        disabled={busy}
                        aria-label={`${row.fullName} contesta las preguntas de los invitados`}
                        className="size-4 accent-[var(--accent)]"
                      />
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditing(row.id)}
                        className="text-[0.82rem] text-ink-muted transition-colors hover:text-accent"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => run(() => removeOrganizer(eventId, row.id))}
                        disabled={busy}
                        className="ml-4 text-[0.82rem] text-ink-muted transition-colors hover:text-accent disabled:opacity-50"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-muted">
        {rows.length > 1
          ? "La pregunta de un invitado le llega sólo a la persona marcada. Si llegara a todos, el mismo invitado recibiría tres respuestas distintas."
          : "La persona marcada recibe en su WhatsApp las preguntas que yo no sé contestar, y lo que responda se lo comparto al invitado."}
      </p>

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
          disabled={adding}
          className="rounded-full bg-action px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
        >
          {adding ? "Agregando…" : "Agregar"}
        </button>
      </form>

      {state.error && <p className="mt-3 text-[0.88rem] text-danger">{state.error}</p>}
      {state.ok && <p className="mt-3 text-[0.88rem] text-ink-soft">{state.ok}</p>}
      {error && <p className="mt-3 text-[0.88rem] text-danger">{error}</p>}

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

/**
 * The same row, editable in place.
 *
 * In place rather than a dialog because there are two fields, and because the
 * thing being corrected is usually a phone number the person is reading off
 * another screen.
 */
function EditRow({
  eventId,
  row,
  onDone,
}: {
  eventId: string;
  row: OrganizerRow;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<OrganizerState, FormData>(
    updateOrganizer.bind(null, eventId, row.id),
    {},
  );

  // Cleared during render rather than in an effect: the row is already showing
  // the saved values by the time this runs.
  const [seenOk, setSeenOk] = useState(state.ok);
  if (state.ok !== seenOk) {
    setSeenOk(state.ok);
    if (state.ok) onDone();
  }

  return (
    <tr>
      <td colSpan={4} className="py-3">
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input
            name="fullName"
            defaultValue={row.fullName}
            required
            className="min-w-[9rem] flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[0.9rem] text-ink"
          />
          <input
            name="phone"
            type="tel"
            defaultValue={row.phoneE164}
            required
            className="min-w-[11rem] flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[0.9rem] text-ink"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-action px-4 py-2 text-[0.82rem] text-paper disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="text-[0.82rem] text-ink-muted hover:text-accent"
          >
            Cancelar
          </button>
          {state.error && <span className="text-[0.85rem] text-danger">{state.error}</span>}
        </form>
      </td>
    </tr>
  );
}
