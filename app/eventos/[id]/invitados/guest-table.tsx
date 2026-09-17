"use client";

import { Fragment, useState, useTransition } from "react";
import { deleteGuests } from "@/lib/guests/actions";
import { formatPhone } from "@/lib/phone";
import { inviteLabels, type SkipReason, type MissingField } from "@/lib/campaigns/labels";
import type { TemplateName } from "@/lib/whatsapp/templates";
import { SendInvitations } from "./send-invitations";
import { EditGuest } from "./edit-guest";

export type GuestRow = {
  id: string;
  fullName: string;
  phoneE164: string | null;
  email: string | null;
  groupName: string | null;
  partySizeAllowed: number;
  partySizeConfirmed: number | null;
  rsvpStatus: string;
  inviteStatus: string;
};

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
  rows,
  invite,
  groups,
  maxPartySize,
  archived = false,
}: {
  eventId: string;
  rows: GuestRow[];
  invite: InviteContext;
  groups: string[];
  maxPartySize: number;
  archived?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
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

  // Everyone who could be invited right now: never invited, or a send that
  // failed. `invite.eligible` is built by the same module the send action
  // uses, so this button can never offer someone the action would refuse.
  const pendingIds = rows.map((row) => row.id).filter((id) => id in invite.eligible);

  function removeSelected() {
    const ids = [...selected];
    const names = rows.filter((r) => ids.includes(r.id)).map((r) => r.fullName);
    const label = names.length === 1 ? names[0] : `${names.length} invitados`;
    if (!window.confirm(`¿Quitar a ${label} de la lista?`)) return;
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
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-[0.85rem] text-paper"
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
        {selected.size > 0 && !sending && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSending(true)}
              disabled={pending}
              className="rounded-full bg-accent px-4 py-1.5 text-[0.85rem] text-paper transition-opacity disabled:opacity-50"
            >
              Enviar invitación
            </button>
            <button
              type="button"
              onClick={removeSelected}
              disabled={pending}
              className="rounded-full border border-accent px-4 py-1.5 text-[0.85rem] text-accent transition-colors hover:bg-accent hover:text-paper disabled:opacity-50"
            >
              {pending ? "Quitando…" : "Quitar"}
            </button>
          </div>
        )}
      </div>

      {sending && (
        <SendInvitations
          eventId={eventId}
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

      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[38rem] text-left text-[0.9rem]">
          <thead className="border-b border-line">
            <tr className="text-ink-muted">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5 font-medium">Nombre</th>
              <th className="px-3 py-2.5 font-medium">Contacto</th>
              <th className="px-3 py-2.5 font-medium">Grupo</th>
              <th className="px-3 py-2.5 font-medium">Invitación</th>
              <th className="px-3 py-2.5 font-medium">Asistencia</th>
              <th className="px-3 py-2.5 font-medium">Confirmados</th>
              <th className="w-16 px-3 py-2.5" />
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
                <td className="px-3 py-2.5">
                  {!archived && (
                    <input
                      type="checkbox"
                      checked={selected.has(guest.id)}
                      onChange={() => toggle(guest.id)}
                      className="size-4 accent-[var(--accent)]"
                    />
                  )}
                </td>
                <td className="px-3 py-2.5 text-ink">
                  {guest.fullName}
                  {guest.partySizeAllowed > 1 && (
                    <span className="ml-2 text-[0.8rem] text-ink-muted">
                      +{guest.partySizeAllowed - 1}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-ink-soft">
                  {guest.phoneE164 ? formatPhone(guest.phoneE164) : ""}
                  {guest.email && (
                    <span className="block text-[0.82rem] text-ink-muted">{guest.email}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-ink-soft">{guest.groupName ?? "—"}</td>
                <td className="px-3 py-2.5 text-ink-soft">
                  {inviteLabels[guest.inviteStatus] ?? guest.inviteStatus}
                </td>
                <td className="px-3 py-2.5 text-ink-soft">
                  {rsvpLabels[guest.rsvpStatus] ?? guest.rsvpStatus}
                </td>
                <td className="px-3 py-2.5 text-ink-soft">
                  {guest.rsvpStatus === "confirmed" ? (guest.partySizeConfirmed ?? 1) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right">
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
