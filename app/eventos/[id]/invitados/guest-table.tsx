"use client";

import { Fragment, useState, useTransition } from "react";
import { confirmGuests, deleteGuests } from "@/lib/guests/actions";
import { formatPhone } from "@/lib/phone";
import { inviteLabels, type SkipReason, type MissingField } from "@/lib/campaigns/labels";
import type { TemplateName } from "@/lib/whatsapp/templates";
import { SendInvitations } from "./send-invitations";
import { EditGuest } from "./edit-guest";
import { GuestTimeline } from "./guest-timeline";

export type GuestRow = {
  id: string;
  fullName: string;
  phoneE164: string | null;
  email: string | null;
  groupName: string | null;
  partySizeAllowed: number;
  partySizeConfirmed: number | null;
  isVip: boolean;
  tableNumber: string | null;
  notes: string | null;
  rsvpStatus: string;
  inviteStatus: string;
  /** Null until the one nudge has gone out. Shown beside "Sin responder". */
  rsvpReminderSentAt: Date | null;
};

/** "20 sep" — the date alone; the panel has the hour for anyone who needs it. */
const reminderFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

const rsvpLabels: Record<string, string> = {
  no_response: "Sin responder",
  confirmed: "Confirmado",
  declined: "No podrá",
  maybe: "Tal vez",
  waitlist: "Lista de espera",
};

/** Everything the invitation panel needs, resolved on the server by `invitationPlan`. */
export type InviteContext = {
  eventVars: string[];
  missing: MissingField[];
  eligible: Record<string, { greeting: string; template: TemplateName }>;
  skipped: Record<string, SkipReason>;
};

export function GuestTable({
  eventId,
  eventName,
  rows,
  invite,
  groups,
  maxPartySize,
  archived = false,
}: {
  eventId: string;
  eventName: string;
  rows: GuestRow[];
  invite: InviteContext;
  groups: string[];
  maxPartySize: number;
  archived?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const editingGuest = rows.find((row) => row.id === editing) ?? null;
  const historyGuest = rows.find((row) => row.id === history) ?? null;

  // Everyone who could be invited right now: never invited, or a send that
  // failed. `invite.eligible` is built by the same module the send action
  // uses, so this button can never offer someone the action would refuse.
  const pendingIds = rows.map((row) => row.id).filter((id) => id in invite.eligible);

  // Everyone still silent. The host reads "entregada" or "leída" on these rows
  // and knows the answer came some other way — at the office, in a group chat —
  // which is exactly the list they want to tick off in one go.
  const silentIds = rows.filter((row) => row.rsvpStatus === "no_response").map((row) => row.id);

  const selectedRows = rows.filter((row) => selected.has(row.id));
  const canBringCompanion = selectedRows.some((row) => row.partySizeAllowed > 1);

  function confirmSelected(withCompanion: boolean) {
    const ids = [...selected];
    const label = ids.length === 1 ? selectedRows[0].fullName : `${ids.length} invitados`;
    const seats = withCompanion
      ? " con acompañante (a quien su invitación se lo permita)"
      : "";
    if (!window.confirm(`¿Confirmar la asistencia de ${label}${seats}?`)) return;
    startTransition(async () => {
      const result = await confirmGuests(eventId, ids, withCompanion);
      setNote(result.ok ?? result.error ?? null);
      setSelected(new Set());
    });
  }

  function removeSelected() {
    const ids = [...selected];
    const names = rows.filter((r) => ids.includes(r.id)).map((r) => r.fullName);
    const label = names.length === 1 ? names[0] : `${names.length} invitados`;
    if (!window.confirm(`¿Borrar a ${label} de la lista?`)) return;
    startTransition(async () => {
      await deleteGuests(eventId, ids);
      setSelected(new Set());
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-paper-deep p-8 text-center text-ink-muted">
        Todavía no hay invitados. Agrégalos uno por uno o importa tu lista.
      </p>
    );
  }

  return (
    <div>
      {!archived && pendingIds.length > 0 && !sending && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper-deep p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[0.92rem] text-ink">
              {pendingIds.length === 1
                ? "1 invitado sin invitación"
                : `${pendingIds.length} invitados sin invitación`}
            </p>
            <p className="text-[0.82rem] text-ink-muted">
              Los que agregaste después del último envío, y los que fallaron.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              // Selects them for you, then shows the same confirmation as a
              // manual send. Skipping the preview would make one click spend
              // real money on messages that cannot be recalled.
              setSelected(new Set(pendingIds));
              setSending(true);
            }}
            className="shrink-0 rounded-full bg-action px-4 py-2 text-[0.85rem] text-ink-onaction"
          >
            Enviar invitaciones pendientes
          </button>
        </div>
      )}

      <div className={`flex min-h-9 items-center justify-between gap-4 ${archived ? "hidden" : ""}`}>
        <label className="flex items-center gap-2 text-[0.85rem] text-ink-muted">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) =>
              setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
            }
            className="size-4 accent-[var(--accent)]"
          />
          {selected.size > 0 ? `${selected.size} seleccionados` : "Seleccionar todos"}
        </label>
        {silentIds.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected(new Set(silentIds))}
            className="text-[0.85rem] text-ink-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
          >
            {silentIds.length === 1
              ? "Seleccionar al que no ha respondido"
              : `Seleccionar los ${silentIds.length} sin responder`}
          </button>
        )}
        {selected.size > 0 && !sending && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSending(true)}
              disabled={pending}
              className="rounded-full bg-action px-4 py-1.5 text-[0.85rem] text-ink-onaction transition-opacity disabled:opacity-50"
            >
              Enviar invitación
            </button>
            <button
              type="button"
              onClick={() => confirmSelected(false)}
              disabled={pending}
              className="rounded-full border border-line px-4 py-1.5 text-[0.85rem] text-ink-soft transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Confirmar
            </button>
            {canBringCompanion && (
              <button
                type="button"
                onClick={() => confirmSelected(true)}
                disabled={pending}
                className="rounded-full border border-line px-4 py-1.5 text-[0.85rem] text-ink-soft transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                Confirmar con +1
              </button>
            )}
            <button
              type="button"
              onClick={removeSelected}
              disabled={pending}
              className="rounded-full border border-accent px-4 py-1.5 text-[0.85rem] text-accent transition-colors hover:bg-action hover:text-ink-onaction disabled:opacity-50"
            >
              {pending ? "Borrando…" : "Borrar"}
            </button>
          </div>
        )}
      </div>

      {note && (
        <p className="mt-2 rounded-xl border border-line bg-paper-deep px-4 py-2 text-[0.85rem] text-ink-soft">
          {note}{" "}
          <button
            type="button"
            onClick={() => setNote(null)}
            className="text-ink-muted transition-colors hover:text-accent"
          >
            Cerrar
          </button>
        </p>
      )}

      {sending && (
        <SendInvitations
          eventId={eventId}
          eventName={eventName}
          eventVars={invite.eventVars}
          missing={invite.missing}
          eligible={invite.eligible}
          skipped={invite.skipped}
          selected={rows
            .filter((row) => selected.has(row.id))
            .map((row) => ({ id: row.id, fullName: row.fullName }))}
          onClose={() => {
            setSending(false);
            setSelected(new Set());
          }}
        />
      )}

      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-paper-deep">
        <table className="w-full text-left text-[0.88rem]">
          <thead className="border-b border-line">
            <tr className="text-ink-muted">
              <th className="w-8 px-2 py-2.5" />
              <th className="px-2 py-2.5 font-medium">Nombre</th>
              <th className="px-2 py-2.5 font-medium">Contacto</th>
              <th className="whitespace-nowrap px-2 py-2.5 font-medium">Grupo</th>
              <th className="whitespace-nowrap px-2 py-2.5 font-medium">Status</th>
              <th className="whitespace-nowrap px-2 py-2.5 font-medium">Asistencia</th>
              <th className="whitespace-nowrap px-2 py-2.5 font-medium"># Conf</th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((guest) => (
              <Fragment key={guest.id}>
              <tr
                className={`border-b border-line/60 last:border-0 ${
                  editing === guest.id ? "bg-paper-deep" : ""
                }`}
              >
                <td className="px-2 py-2.5">
                  {!archived && (
                    <input
                      type="checkbox"
                      checked={selected.has(guest.id)}
                      onChange={() => toggle(guest.id)}
                      className="size-4 accent-[var(--accent)]"
                    />
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 text-ink">
                  {guest.fullName}
                  {guest.partySizeAllowed > 1 && (
                    <span className="ml-2 text-[0.8rem] text-ink-muted">
                      +{guest.partySizeAllowed - 1}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-ink-soft">
                  {guest.phoneE164 ? formatPhone(guest.phoneE164) : ""}
                  {guest.email && (
                    <span
                      className="block max-w-[10rem] truncate text-[0.82rem] text-ink-muted"
                      title={guest.email}
                    >
                      {guest.email}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-ink-soft">{guest.groupName ?? "—"}</td>
                <td className="px-2 py-2.5 text-ink-soft">
                  {inviteLabels[guest.inviteStatus] ?? guest.inviteStatus}
                </td>
                <td className="px-2 py-2.5 text-ink-soft">
                  {rsvpLabels[guest.rsvpStatus] ?? guest.rsvpStatus}
                  {/* Not a status of its own: "recordado" is something we did,
                      and folding it into the RSVP would take this row out of
                      "sin responder" — which is what the counts and the bulk
                      selection are built on. */}
                  {guest.rsvpStatus === "no_response" && guest.rsvpReminderSentAt && (
                    <span className="block text-[0.78rem] text-ink-muted">
                      recordado {reminderFmt.format(new Date(guest.rsvpReminderSentAt))}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-ink-soft">
                  {guest.rsvpStatus === "confirmed" ? (guest.partySizeConfirmed ?? 1) : "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => setHistory(guest.id)}
                    title={`Historial de ${guest.fullName}`}
                    aria-label={`Historial de ${guest.fullName}`}
                    className="mr-2 inline-flex size-5 items-center justify-center rounded-full border border-line align-middle font-serif text-[0.72rem] leading-none text-ink-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    i
                  </button>
                  {!archived && (
                    <button
                      type="button"
                      onClick={() => setEditing(editing === guest.id ? null : guest.id)}
                      className="text-[0.82rem] text-ink-muted transition-colors hover:text-accent"
                    >
                      {editing === guest.id ? "Cerrar" : "Editar"}
                    </button>
                  )}
                </td>
              </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {historyGuest && (
        <GuestTimeline
          eventId={eventId}
          guest={{ id: historyGuest.id, fullName: historyGuest.fullName }}
          onClose={() => setHistory(null)}
        />
      )}

      {editingGuest && (
        <div className="mt-3">
          <EditGuest
            eventId={eventId}
            guest={editingGuest}
            groups={groups}
            maxPartySize={maxPartySize}
            onDone={() => setEditing(null)}
          />
        </div>
      )}
    </div>
  );
}
