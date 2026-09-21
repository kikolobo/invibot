"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { confirmGuests, deleteGuests } from "@/lib/guests/actions";
import { formatPhone } from "@/lib/phone";
import { inviteLabels, type SkipReason, type MissingField } from "@/lib/campaigns/labels";
import type { TemplateName } from "@/lib/whatsapp/templates";
import { SendInvitations } from "./send-invitations";
import { EditGuest } from "./edit-guest";
import { GuestTimeline } from "./guest-timeline";
import { AddGuest } from "./add-guest";
import { Overlay } from "@/components/ui/overlay";

export type GuestRow = {
  id: string;
  fullName: string;
  phoneE164: string | null;
  email: string | null;
  groupName: string | null;
  partySizeAllowed: number;
  partySizeConfirmed: number | null;
  /** Their +1 by name, when anyone has told us. */
  companionName: string | null;
  createdAt: Date;
  updatedAt: Date;
  rsvpRespondedAt: Date | null;
  /** When the last invitation actually left, off the `sends` ledger. */
  invitedAt: string | null;
  isVip: boolean;
  tableNumber: string | null;
  notes: string | null;
  rsvpStatus: string;
  inviteStatus: string;
  /** Null until the one nudge has gone out. Shown beside "Sin responder". */
  rsvpReminderSentAt: Date | null;
};

/**
 * How the list can be ordered.
 *
 * `grupo` is what the server already sent — group order, then name — and stays
 * the default: it is how a host reads a list out loud, and changing what
 * people see without being asked is its own kind of bug.
 */
const sorts = [
  { key: "grupo", label: "Grupo" },
  { key: "nombre", label: "Nombre" },
  { key: "alta", label: "Fecha de alta" },
  { key: "confirmado", label: "Fecha de confirmación" },
  { key: "invitacion", label: "Fecha de invitación" },
  { key: "cambio", label: "Último cambio" },
  { key: "envio", label: "Estado de invitación" },
  { key: "asistencia", label: "Asistencia" },
] as const;

/**
 * Los dos estados, ordenados por lo que hay que hacer con ellos y no por
 * alfabeto: "Enviada" antes que "Entregada" es progreso, y "Entregada" antes
 * que "Enviada" es sólo la letra E.
 *
 * Ascendente pone primero lo que pide atención — un envío que falló, alguien
 * que no ha contestado — y descendente, lo que ya está resuelto.
 */
const inviteRank: Record<string, number> = {
  failed: 0,
  pending: 1,
  queued: 2,
  sent: 3,
  delivered: 4,
  read: 5,
};

const rsvpRank: Record<string, number> = {
  no_response: 0,
  maybe: 1,
  waitlist: 2,
  declined: 3,
  confirmed: 4,
};

type SortKey = (typeof sorts)[number]["key"];

const at = (value: Date | string | null): number | null =>
  value ? new Date(value).getTime() : null;

/** What each ordering compares. Null means "nunca pasó". */
function valueFor(row: GuestRow, key: SortKey): number | string | null {
  switch (key) {
    case "nombre":
      return row.fullName.toLocaleLowerCase("es");
    case "alta":
      return at(row.createdAt);
    case "confirmado":
      return at(row.rsvpRespondedAt);
    case "invitacion":
      return at(row.invitedAt);
    case "cambio":
      return at(row.updatedAt);
    case "envio":
      return inviteRank[row.inviteStatus] ?? 99;
    case "asistencia":
      return rsvpRank[row.rsvpStatus] ?? 99;
    case "grupo":
      return null;
  }
}

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
  capacity,
  autoRegister,
  recent,
}: {
  eventId: string;
  eventName: string;
  rows: GuestRow[];
  invite: InviteContext;
  groups: string[];
  maxPartySize: number;
  archived?: boolean;
  capacity: number | null;
  autoRegister: boolean;
  /** Ids, resueltos en el servidor, de lo que pasó en las últimas 24 horas. */
  recent: { confirmed: string[]; approved: string[] };
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [filter, setFilter] = useState<null | keyof typeof filters>(null);
  const [sortKey, setSortKey] = useState<SortKey>("grupo");
  const [ascending, setAscending] = useState(true);

  const isConfirmed = (row: GuestRow) => row.rsvpStatus === "confirmed";
  const withCompanion = (row: GuestRow) =>
    isConfirmed(row) && (row.partySizeConfirmed ?? 1) > 1;

  /**
   * Cada casilla que se puede tocar, y a quién deja en pantalla.
   *
   * `lugares` es el único donde el número y la lista no coinciden: la casilla
   * cuenta lugares y el filtro muestra personas — las que traen a alguien. Por
   * eso la etiqueta de arriba dice a cuántas está viendo.
   */
  const filters = {
    conf24: {
      // Abreviado para que las casillas quepan en un renglón. La etiqueta de
      // arriba de la tabla dice la frase completa cuando el filtro está
      // puesto, que es cuando hace falta entenderla.
      label: "Conf. últ. 24H",
      ids: recent.confirmed,
      seeing: "Viendo a quienes confirmaron en las últimas 24 horas",
    },
    reg24: {
      label: "Auto-Reg. últ. 24H",
      ids: recent.approved,
      seeing: "Viendo los auto-registros que aprobaste en las últimas 24 horas",
    },
    confirmados: {
      label: "Confirmados",
      ids: rows.filter(isConfirmed).map((row) => row.id),
      seeing: "Viendo a los confirmados",
    },
    lugares: {
      label: "Lugares",
      ids: rows.filter(withCompanion).map((row) => row.id),
      seeing: "Viendo a los confirmados que vienen acompañados",
    },
  } as const;

  // Lo filtrado es la lista para todo lo demás: seleccionar, ordenar, contar
  // lo seleccionable. Lo que no ves no se selecciona.
  const visible = useMemo(() => {
    if (!filter) return rows;
    const ids = new Set(filters[filter].ids);
    return rows.filter((row) => ids.has(row.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, recent]);

  const sorted = useMemo(() => {
    const copy = [...visible];
    if (sortKey === "grupo") return ascending ? copy : copy.reverse();

    return copy.sort((a, b) => {
      const left = valueFor(a, sortKey);
      const right = valueFor(b, sortKey);

      // Whoever it never happened to goes last, whichever way the arrow points:
      // a column of "—" at the top is nobody's idea of sorted.
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;

      const order = typeof left === "string" ? left.localeCompare(String(right), "es") : left - Number(right);
      return ascending ? order : -order;
    });
  }, [visible, sortKey, ascending]);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = visible.length > 0 && selected.size === visible.length;
  const editingGuest = rows.find((row) => row.id === editing) ?? null;
  const historyGuest = rows.find((row) => row.id === history) ?? null;

  // Everyone who could be invited right now: never invited, or a send that
  // failed. `invite.eligible` is built by the same module the send action
  // uses, so this button can never offer someone the action would refuse.
  const pendingIds = visible.map((row) => row.id).filter((id) => id in invite.eligible);

  // Everyone still silent. The host reads "entregada" or "leída" on these rows
  // and knows the answer came some other way — at the office, in a group chat —
  // which is exactly the list they want to tick off in one go.
  const silentIds = visible.filter((row) => row.rsvpStatus === "no_response").map((row) => row.id);

  // Con selección la fila cambia de oficio: deja de servir para mirar y pasa a
  // servir para actuar. Mientras se manda, el panel de envío manda la escena.
  const acting = selected.size > 0 && !sending;

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

  // Over the list rather than under it. With eighty names the old form sat
  // below the fold, so adding one meant scrolling past everybody first.
  const addButton = archived ? null : (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="rounded-full bg-action px-4 py-1.5 text-[0.85rem] text-ink-onaction"
    >
      Agregar invitado
    </button>
  );

  const addDialog = adding ? (
    <Overlay onClose={() => setAdding(false)} title="Agregar invitado">
      <AddGuest eventId={eventId} maxPartySize={maxPartySize} groups={groups} />
    </Overlay>
  ) : null;

  const confirmedRows = rows.filter((row) => row.rsvpStatus === "confirmed");
  const seats = confirmedRows.reduce(
    (total, row) => total + (row.partySizeConfirmed ?? row.partySizeAllowed),
    0,
  );

  /**
   * Una casilla que filtra. `null` es "En la lista": quita cualquier filtro y
   * queda marcada cuando no hay ninguno, así que la fila entera se lee como un
   * juego de opciones y no como un número suelto entre botones.
   */
  const tile = (key: keyof typeof filters | null, shows?: number) => {
    const { label, ids } = key
      ? filters[key]
      : { label: "En la lista", ids: rows.map((row) => row.id) };
    const on = filter === key;
    const value = shows ?? ids.length;
    return (
      <button
        type="button"
        onClick={() => setFilter(on ? null : key)}
        disabled={ids.length === 0}
        aria-pressed={on}
        className={`rounded-lg px-2 py-1 text-left transition-colors disabled:cursor-default ${
          on ? "bg-action text-ink-onaction" : "hover:bg-paper-deep disabled:hover:bg-transparent"
        }`}
      >
        <span className="eyebrow block">{label}</span>
        <span className="mt-1 block font-display text-2xl">{value}</span>
      </button>
    );
  };

  // Los totales son totales: no se recalculan sobre lo filtrado, o el número
  // que acabas de tocar cambiaría debajo de tu dedo.
  const stats = (
    <dl className="mt-6 flex flex-wrap items-start gap-x-10 gap-y-3 border-y border-line py-5">
      <div className="text-ink">{tile(null, rows.length)}</div>
      {/* "Lugares" a secas: el renglón lo agradece y el número vive junto a
          "Confirmados", que es lo que lo explica. El reporte sí dice "Lugares
          confirmados", donde se lee solo. */}
      <div className="text-ink">{tile("confirmados", confirmedRows.length)}</div>
      <div className="text-ink">{tile("lugares", seats)}</div>
      {capacity && (
        <div>
          <dt className="eyebrow">Cupo</dt>
          <dd className="mt-1 font-display text-2xl text-ink">{capacity}</dd>
        </div>
      )}
      <div className="text-ink">{tile("conf24")}</div>
      {autoRegister && <div className="text-ink">{tile("reg24")}</div>}
    </dl>
  );

  const filterChip = filter && (
    <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper-deep px-4 py-2 text-[0.85rem] text-ink-soft">
      {filters[filter].seeing} ({visible.length}
      {visible.length === 1 ? " invitado" : " invitados"})
      <button
        type="button"
        onClick={() => setFilter(null)}
        className="text-ink-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
      >
        Quitar filtro
      </button>
    </p>
  );

  if (rows.length === 0) {
    return (
      <div>
        {stats}
        <div className="mt-3 flex justify-end">{addButton}</div>
        <p className="mt-3 rounded-xl border border-dashed border-line bg-paper-deep p-8 text-center text-ink-muted">
          Todavía no hay invitados. Agrégalos uno por uno o importa tu lista.
        </p>
        {addDialog}
      </div>
    );
  }

  return (
    <div>
      {stats}
      {filterChip}

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

      {/* Una fila que se transforma. Sin selección es para mirar —ordenar,
          agregar—; con selección es para actuar, y lo de mirar estorba. Se
          queda pegada arriba mientras haya selección: en una lista larga, los
          botones que elegiste allá arriba ya no se ven cuando bajas. */}
      <div
        className={`flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2 ${
          archived ? "hidden" : ""
        } ${acting ? "sticky top-0 z-30 -mx-2 border-b border-line bg-paper px-2 py-2" : ""}`}
      >
        <label className="flex items-center gap-2 text-[0.85rem] text-ink-muted">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) =>
              setSelected(e.target.checked ? new Set(visible.map((r) => r.id)) : new Set())
            }
            className="size-4 accent-[var(--accent)]"
          />
          {selected.size > 0 ? (
            <span className="text-ink">
              {selected.size} {selected.size === 1 ? "seleccionado" : "seleccionados"}
              {/* Con filtro puesto, sobre qué se va a actuar no es obvio. */}
              {filter && ` de los ${visible.length} que estás viendo`}
            </span>
          ) : (
            "Seleccionar todos"
          )}
        </label>

        {!acting && silentIds.length > 0 && (
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

        {!acting && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[0.85rem] text-ink-muted">
              Ordenar por
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-lg border border-line bg-paper-deep px-2 py-1 text-[0.85rem] text-ink outline-none focus:border-accent"
              >
                {sorts.map((sort) => (
                  <option key={sort.key} value={sort.key}>
                    {sort.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setAscending((up) => !up)}
              title={ascending ? "Ascendente" : "Descendente"}
              aria-label={ascending ? "Orden ascendente" : "Orden descendente"}
              className="inline-flex size-6 items-center justify-center rounded-full border border-line text-[0.75rem] text-ink-muted transition-colors hover:border-accent hover:text-accent"
            >
              {ascending ? "↑" : "↓"}
            </button>
            {addButton}
          </div>
        )}

        {acting && (
          <div className="flex flex-wrap items-center gap-3">
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

            {/* Lo único que no se deshace, detrás del ⋯. Es el único lugar
                donde un menú se gana su lugar: esconder lo que no quieres
                tocar por accidente, a un dedo de «Confirmar». */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((open) => !open)}
                disabled={pending}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                aria-label="Más acciones"
                className="inline-flex size-7 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                ⋯
              </button>
              {moreOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Cerrar"
                    onClick={() => setMoreOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 min-w-40 rounded-xl border border-line bg-paper p-1 shadow-xl"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        removeSelected();
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-[0.85rem] text-danger transition-colors hover:bg-paper-deep"
                    >
                      {pending ? "Borrando…" : "Borrar de la lista"}
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[0.85rem] text-ink-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
            >
              Quitar selección
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
            {sorted.map((guest) => (
              <Fragment key={guest.id}>
              <tr className="border-b border-line/60 last:border-0">
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
                  {guest.companionName && (
                    <span className="block text-[0.8rem] text-ink-muted">
                      con {guest.companionName}
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
                      selection are built on. Shown whichever way the reminder
                      went out, and whatever they answered afterwards: "confirmó
                      después de que le recordamos" is the thing worth seeing. */}
                  {guest.rsvpReminderSentAt && (
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
                      onClick={() => setEditing(guest.id)}
                      title={`Editar a ${guest.fullName}`}
                      aria-label={`Editar a ${guest.fullName}`}
                      className="inline-flex size-5 items-center justify-center rounded-full border border-line align-middle text-ink-muted transition-colors hover:border-accent hover:text-accent"
                    >
                      {/* Drawn rather than an emoji: ✏️ arrives in colour and a
                          different shape on every platform, and this one sits
                          beside the (i), where they have to match. */}
                      <svg
                        viewBox="0 0 16 16"
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M11.2 2.3a1.6 1.6 0 0 1 2.3 2.3L5.4 12.7l-3 .7.7-3z" />
                        <path d="M10.3 3.4 12.4 5.5" />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {addDialog}

      {historyGuest && (
        <GuestTimeline
          eventId={eventId}
          guest={{ id: historyGuest.id, fullName: historyGuest.fullName }}
          onClose={() => setHistory(null)}
        />
      )}

      {/* Over the list rather than unfolded beneath it: editing a row is one
          thing at a time, and a form that pushes the table around leaves the
          organizer hunting for the row they were on. */}
      {editingGuest && (
        <Overlay
          onClose={() => setEditing(null)}
          title={editingGuest.fullName}
          subtitle="Editar invitado"
        >
          <EditGuest
            eventId={eventId}
            guest={editingGuest}
            groups={groups}
            maxPartySize={maxPartySize}
            onDone={() => setEditing(null)}
          />
        </Overlay>
      )}
    </div>
  );
}
