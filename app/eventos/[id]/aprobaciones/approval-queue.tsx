"use client";

import { useState, useTransition } from "react";
import { setGuestApproval, renameGuest } from "@/lib/guests/actions";
import { approveAndInvite } from "@/lib/campaigns/actions";

export type PendingGuest = {
  id: string;
  fullName: string;
  phoneE164: string | null;
  notes: string | null;
  createdAt: Date;
  approvalStatus: string;
};

const joined = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Who signed themselves up, and what the host does about it.
 *
 * Bulk from the start. One link pasted into one group comes back as forty rows,
 * and approving those one at a time is not a feature.
 *
 * Deliberately its own panel above the list rather than a column inside it:
 * these people are not guests yet, and putting them in the table would mean
 * every count and every selection on that table had to explain itself.
 */
export function ApprovalQueue({
  eventId,
  pending,
  rejected,
}: {
  eventId: string;
  pending: PendingGuest[];
  rejected: PendingGuest[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRejected, setShowRejected] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (pending.length === 0 && rejected.length === 0) return null;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const all = () =>
    setSelected((current) =>
      current.size === pending.length ? new Set() : new Set(pending.map((g) => g.id)),
    );

  const decide = (ids: string[], approved: boolean) =>
    start(async () => {
      await setGuestApproval(eventId, ids, approved);
      setSelected(new Set());
      setNote(null);
    });

  /**
   * The usual next thing after approving, in one press. The report comes back
   * per guest, because "3 invitaciones enviadas" hides the one that failed.
   */
  const approveAndSend = (ids: string[]) =>
    start(async () => {
      const report = await approveAndInvite(eventId, ids);
      setSelected(new Set());
      if (report.error) {
        setError(report.error);
        return;
      }
      const failed = report.outcomes?.filter((o) => !o.ok) ?? [];
      setNote(
        failed.length === 0
          ? `${report.sent} ${report.sent === 1 ? "invitación enviada" : "invitaciones enviadas"}.`
          : `${report.sent} enviada(s). No salieron: ${failed
              .map((o) => `${o.name} (${o.detail ?? "error"})`)
              .join(", ")}`,
      );
    });

  const save = (guestId: string) =>
    start(async () => {
      const result = await renameGuest(eventId, guestId, draft);
      setError(result.error ?? null);
      if (!result.error) setEditing(null);
    });

  const chosen = [...selected];

  return (
    <section className="mt-6 rounded-xl border border-accent/40 bg-paper-deep p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg text-ink">
          {pending.length > 0
            ? `${pending.length} ${pending.length === 1 ? "registro" : "registros"} por aprobar`
            : "Registros"}
        </h2>
        {pending.length > 0 && (
          <button
            type="button"
            onClick={all}
            className="text-[0.82rem] text-ink-muted transition-colors hover:text-accent"
          >
            {selected.size === pending.length ? "Quitar selección" : "Seleccionar todos"}
          </button>
        )}
      </div>

      {pending.length > 0 && (
        <p className="mt-1 text-[0.85rem] leading-relaxed text-ink-muted">
          Corrige los nombres antes de aprobar: llegan como la persona los escribió en su
          teléfono, o como se llama su WhatsApp — «FL», «Kiko», el nombre de un negocio.
        </p>
      )}

      <ul className="mt-4 space-y-1">
        {pending.map((guest) => (
          <li key={guest.id}>
            <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-paper">
              <input
                type="checkbox"
                aria-label={`Seleccionar ${guest.fullName}`}
                checked={selected.has(guest.id)}
                onChange={() => toggle(guest.id)}
                className="size-4 shrink-0 accent-[var(--accent)]"
              />
              <div className="min-w-0 flex-1">
                {editing === guest.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") save(guest.id);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-[0.95rem] text-ink"
                    />
                    <button
                      type="button"
                      onClick={() => save(guest.id)}
                      disabled={busy}
                      className="shrink-0 text-[0.8rem] text-accent disabled:opacity-50"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="shrink-0 text-[0.8rem] text-ink-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  // The whole name is the target, but it carries a visible
                  // "Editar" beside it: the first version cued this with a
                  // hover colour and a tooltip, which is no cue at all on the
                  // phone most of this gets done from.
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(guest.id);
                      setDraft(guest.fullName);
                    }}
                    className="group flex max-w-full items-baseline gap-2 text-left"
                  >
                    <span className="truncate text-[0.95rem] text-ink group-hover:text-accent">
                      {guest.fullName}
                    </span>
                    <span className="shrink-0 text-[0.75rem] text-ink-muted underline decoration-dotted underline-offset-2 group-hover:text-accent">
                      Editar
                    </span>
                  </button>
                )}
                <span className="block truncate text-[0.8rem] text-ink-muted">
                  {guest.phoneE164 ?? "sin teléfono"} · {joined.format(guest.createdAt)}
                  {guest.notes?.startsWith("auto-registro:") && ` · ${guest.notes.slice("auto-registro:".length).trim()}`}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {chosen.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => approveAndSend(chosen)}
            disabled={busy}
            className="rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
          >
            {busy ? "Enviando…" : `Aprobar y enviar invitación (${chosen.length})`}
          </button>
          <button
            type="button"
            onClick={() => decide(chosen, true)}
            disabled={busy}
            className="rounded-full border border-line px-5 py-2 text-[0.85rem] text-ink-soft disabled:opacity-50"
          >
            Sólo aprobar
          </button>
          <button
            type="button"
            onClick={() => decide(chosen, false)}
            disabled={busy}
            className="rounded-full border border-line px-5 py-2 text-[0.85rem] text-ink-soft disabled:opacity-50"
          >
            Rechazar {chosen.length}
          </button>
        </div>
      )}

      {note && <p className="mt-3 text-[0.88rem] text-ink-soft">{note}</p>}

      {pending.length > 0 && (
        <p className="mt-4 text-[0.8rem] leading-relaxed text-ink-muted">
          «Aprobar y enviar» les manda su invitación en el momento. «Sólo aprobar» los pasa a
          la lista y la invitación sale después, cuando tú la envíes. Rechazar deja de
          contestarles, sin avisarles.
        </p>
      )}

      {error && <p className="mt-3 text-[0.88rem] text-accent">{error}</p>}

      {rejected.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setShowRejected((v) => !v)}
            className="text-[0.82rem] text-ink-muted transition-colors hover:text-accent"
          >
            {rejected.length} {rejected.length === 1 ? "rechazado" : "rechazados"}
            {showRejected ? " ▴" : " ▾"}
          </button>
          {showRejected && (
            <ul className="mt-2 space-y-1">
              {rejected.map((guest) => (
                <li
                  key={guest.id}
                  className="flex items-center justify-between gap-3 px-2 py-1.5"
                >
                  <span className="min-w-0 truncate text-[0.88rem] text-ink-soft">
                    {guest.fullName}
                    <span className="text-ink-muted"> · {guest.phoneE164 ?? "sin teléfono"}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => decide([guest.id], true)}
                    disabled={busy}
                    className="shrink-0 text-[0.8rem] text-ink-muted transition-colors hover:text-accent disabled:opacity-50"
                  >
                    Aprobar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
