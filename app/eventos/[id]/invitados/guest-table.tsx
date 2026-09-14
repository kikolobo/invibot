"use client";

import { useState, useTransition } from "react";
import { deleteGuests } from "@/lib/guests/actions";
import { formatPhone } from "@/lib/phone";

export type GuestRow = {
  id: string;
  fullName: string;
  phoneE164: string | null;
  email: string | null;
  groupLabel: string | null;
  partySizeAllowed: number;
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

export function GuestTable({
  eventId,
  rows,
}: {
  eventId: string;
  rows: GuestRow[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = rows.length > 0 && selected.size === rows.length;

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
      <div className="flex min-h-9 items-center justify-between gap-4">
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
        {selected.size > 0 && (
          <button
            type="button"
            onClick={removeSelected}
            disabled={pending}
            className="rounded-full border border-accent px-4 py-1.5 text-[0.85rem] text-accent transition-colors hover:bg-accent hover:text-paper disabled:opacity-50"
          >
            {pending ? "Quitando…" : "Quitar"}
          </button>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[38rem] text-left text-[0.9rem]">
          <thead className="border-b border-line">
            <tr className="text-ink-muted">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5 font-medium">Nombre</th>
              <th className="px-3 py-2.5 font-medium">Contacto</th>
              <th className="px-3 py-2.5 font-medium">Grupo</th>
              <th className="px-3 py-2.5 font-medium">Asistencia</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((guest) => (
              <tr key={guest.id} className="border-b border-line/60 last:border-0">
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(guest.id)}
                    onChange={() => toggle(guest.id)}
                    className="size-4 accent-[var(--accent)]"
                  />
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
                <td className="px-3 py-2.5 text-ink-soft">{guest.groupLabel ?? "—"}</td>
                <td className="px-3 py-2.5 text-ink-soft">
                  {rsvpLabels[guest.rsvpStatus] ?? guest.rsvpStatus}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
