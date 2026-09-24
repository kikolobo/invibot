"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addMyself,
  inviteOrganizer,
  removeOrganizer,
  resendInvite,
  revokeInvite,
  setInviteRole,
  setOrganizerRole,
  setResponder,
  updateOrganizer,
  type InviteState,
  type InvitedRole,
  type OrganizerState,
} from "@/lib/organizers/actions";

const accessOptions: { value: InvitedRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "guest_manager", label: "Gestor de invitados" },
];

export type OrganizerRow = {
  id: string;
  fullName: string;
  phoneE164: string;
  isResponder: boolean;
  isOwner: boolean;
  /** `organizer` for WhatsApp-only rows from before invitations existed. */
  role: "organizer" | InvitedRole;
  hasAccount: boolean;
  /** This row is the person looking at the page. */
  isYou: boolean;
};

export type PendingInvite = {
  id: string;
  fullName: string;
  phoneE164: string;
  role: InvitedRole;
  link: string;
  /** Ready to paste into the owner's own WhatsApp. */
  message: string;
  sentAt: string | null;
};

/** Opens the owner's own WhatsApp on a chat with this number, message typed. */
const shareHref = (phoneE164: string, message: string) =>
  `https://wa.me/${phoneE164.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;

const th = "py-2 pr-4 text-[0.75rem] font-medium uppercase tracking-wide text-ink-muted";
const quiet =
  "text-[0.82rem] text-ink-muted transition-colors hover:text-accent disabled:opacity-50";

/**
 * Who runs the event, and what each of them may do in the app.
 *
 * Everybody here is an account — the owner, and the people they invited —
 * except rows from before invitations existed, which stay as WhatsApp-only
 * until removed. An invitation nobody has used yet sits in the same list,
 * marked as such, with its link at hand so the owner can send it themselves.
 *
 * Two separate powers still share this screen: what somebody may do in the app
 * (the access column) and whether guests' questions go to them (one radio for
 * the whole event).
 */
export function Organizadores({
  eventId,
  rows,
  invites,
  staffCode,
  ownerListed,
  viewerIsOwner,
}: {
  eventId: string;
  rows: OrganizerRow[];
  invites: PendingInvite[];
  staffCode: string | null;
  ownerListed: boolean;
  viewerIsOwner: boolean;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const run = (fn: () => Promise<OrganizerState>) =>
    start(async () => {
      const result = await fn();
      setError(result.error ?? null);
      setNotice(result.ok ?? null);
      if (!result.error) setEditing(null);
    });

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Liga copiada.");
    } catch {
      setNotice(link);
    }
  };

  return (
    <section className="mt-8">
      <p className="max-w-2xl text-[0.9rem] leading-relaxed text-ink-muted">
        Desde su WhatsApp pueden preguntarme
        <code className="mx-1 rounded bg-paper-deep px-1.5 py-0.5 text-[0.85em]">/confirmados</code>,
        <code className="mx-1 rounded bg-paper-deep px-1.5 py-0.5 text-[0.85em]">/invitados</code> o
        <code className="mx-1 rounded bg-paper-deep px-1.5 py-0.5 text-[0.85em]">/cancelados</code>
        y les contesto al momento.
      </p>

      {!ownerListed &&
        (viewerIsOwner ? (
          <AddMyself eventId={eventId} />
        ) : (
          <p className="mt-6 text-[0.88rem] text-ink-muted">
            El dueño del evento todavía no registra su WhatsApp, así que aún no aparece aquí.
          </p>
        ))}

      {rows.length + invites.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[50rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Nombre</th>
                <th className={th}>WhatsApp</th>
                <th className={th}>Estado</th>
                <th className={th}>Acceso</th>
                <th className={`${th} text-center`}>
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
                    <td className="py-3 pr-4 text-[0.95rem] text-ink">
                      {row.fullName}
                      {row.isYou && (
                        <span className="ml-2 rounded-full bg-paper-deep px-2 py-0.5 text-[0.72rem] text-ink-muted">
                          Tú
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-[0.88rem] text-ink-soft">{row.phoneE164}</td>
                    <td className="py-3 pr-4 text-[0.85rem] text-ink-soft">
                      {row.hasAccount || row.isOwner ? "Organizador" : "Sólo WhatsApp"}
                    </td>
                    <td className="py-3 pr-4 text-[0.85rem] text-ink-soft">
                      {row.isOwner ? (
                        "Dueño"
                      ) : row.hasAccount && row.role !== "organizer" && !row.isYou ? (
                        <select
                          value={row.role}
                          onChange={(e) =>
                            run(() =>
                              setOrganizerRole(eventId, row.id, e.target.value as InvitedRole),
                            )
                          }
                          disabled={busy}
                          aria-label={`Acceso de ${row.fullName}`}
                          className="rounded-lg border border-line bg-paper px-2 py-1 text-[0.85rem] text-ink"
                        >
                          {accessOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : row.role !== "organizer" ? (
                        accessOptions.find((option) => option.value === row.role)?.label
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
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
                      <button type="button" onClick={() => setEditing(row.id)} className={quiet}>
                        Editar
                      </button>
                      {/* Nobody removes the owner, and nobody removes themselves. */}
                      {!row.isOwner && !row.isYou && (
                        <button
                          type="button"
                          onClick={() => run(() => removeOrganizer(eventId, row.id))}
                          disabled={busy}
                          className={`ml-4 ${quiet}`}
                        >
                          {row.hasAccount ? "Quitar acceso" : "Quitar"}
                        </button>
                      )}
                    </td>
                  </tr>
                ),
              )}
              {invites.map((invite) => (
                <tr key={invite.id} className="bg-paper-deep/40">
                  <td className="py-3 pr-4 text-[0.95rem] text-ink-soft">{invite.fullName}</td>
                  <td className="py-3 pr-4 text-[0.88rem] text-ink-soft">{invite.phoneE164}</td>
                  <td className="py-3 pr-4 text-[0.85rem]">
                    <span className="rounded-full bg-action/10 px-2 py-0.5 text-accent">Invitado</span>
                    <span className="mt-1 block text-[0.75rem] text-ink-muted">
                      {invite.sentAt ? "Le llegó por WhatsApp" : "Falta enviarle la liga"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      value={invite.role}
                      onChange={(e) =>
                        run(() => setInviteRole(eventId, invite.id, e.target.value as InvitedRole))
                      }
                      disabled={busy}
                      aria-label={`Acceso que tendrá ${invite.fullName}`}
                      className="rounded-lg border border-line bg-paper px-2 py-1 text-[0.85rem] text-ink"
                    >
                      {accessOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-4 text-center text-[0.8rem] text-ink-muted">—</td>
                  <td className="py-3 text-right">
                    <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                      <a
                        href={shareHref(invite.phoneE164, invite.message)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[0.82rem] text-accent hover:underline"
                      >
                        Enviar por mi WhatsApp
                      </a>
                      <button type="button" onClick={() => copy(invite.link)} className={quiet}>
                        Copiar liga
                      </button>
                      <button
                        type="button"
                        onClick={() => run(() => resendInvite(eventId, invite.id))}
                        disabled={busy}
                        className={quiet}
                      >
                        Reenviar desde Invibot
                      </button>
                      <button
                        type="button"
                        onClick={() => run(() => revokeInvite(eventId, invite.id))}
                        disabled={busy}
                        className={quiet}
                      >
                        Retirar invitación
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="mt-3 text-[0.88rem] text-danger">{error}</p>}
      {notice && <p className="mt-3 break-all text-[0.88rem] text-ink-soft">{notice}</p>}

      <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-muted">
        {rows.length > 1
          ? "La pregunta de un invitado le llega sólo a la persona marcada. Si llegara a todos, el mismo invitado recibiría tres respuestas distintas."
          : "La persona marcada recibe en su WhatsApp las preguntas que yo no sé contestar, y lo que responda se lo comparto al invitado."}
      </p>

      <InviteForm eventId={eventId} />

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
 * Adding somebody to the team, which always means giving them an account's
 * worth of access.
 *
 * Asked by WhatsApp number because that is what the invitation is sent to. A
 * number that already has an account gets access on the spot; one that does
 * not gets a question first — sending a WhatsApp on somebody's behalf is not
 * something a form should do on the first click.
 */
function InviteForm({ eventId }: { eventId: string }) {
  // Controlled, because the confirmation resubmits the same values and React
  // resets an uncontrolled form after every action.
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<InvitedRole>("guest_manager");
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    async (prev: InviteState, formData: FormData) => {
      const result = await inviteOrganizer(eventId, prev, formData);
      // Cleared once something happened, kept while asking or on an error.
      if (result.ok || result.invited) {
        setFullName("");
        setPhone("");
      }
      return result;
    },
    {},
  );

  const input =
    "rounded-lg border border-line bg-paper px-3 py-2 text-[0.9rem] text-ink";

  return (
    <div className="mt-10 border-t border-line pt-8">
      <h2 className="font-display text-xl text-ink">Invitar a organizar</h2>
      <ul className="mt-3 max-w-2xl space-y-1 text-[0.85rem] leading-relaxed text-ink-muted">
        <li>
          <span className="text-ink-soft">Admin:</span> puede hacer todo, menos quitar al dueño.
        </li>
        <li>
          <span className="text-ink-soft">Gestor de invitados:</span> invitados, aprobaciones y
          reportes. No puede cambiar los generales ni los detalles del evento. Si lo marcas para
          contestar preguntas, también puede contestarlas.
        </li>
      </ul>

      <form action={formAction} className="mt-5 space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <input
            name="fullName"
            placeholder="Nombre"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={`min-w-[10rem] flex-1 ${input}`}
          />
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="Su WhatsApp"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`min-w-[11rem] flex-1 ${input}`}
          />
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as InvitedRole)}
            className={input}
          >
            {accessOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {!state.confirm && (
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-action px-5 py-2 text-[0.85rem] text-ink-onaction disabled:opacity-50"
            >
              {pending ? "Buscando…" : "Invitar"}
            </button>
          )}
        </div>

        {state.confirm && (
          <div className="rounded-xl border border-accent/30 bg-action/5 p-4">
            <p className="text-[0.9rem] leading-relaxed text-ink">
              {state.confirm.name} todavía no tiene cuenta en Invibot. ¿Le enviamos una invitación
              por WhatsApp para que se una?
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                name="confirm"
                value="1"
                disabled={pending}
                className="rounded-full bg-action px-5 py-2 text-[0.85rem] text-ink-onaction disabled:opacity-50"
              >
                {pending ? "Enviando…" : "Enviar invitación"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFullName("");
                  setPhone("");
                  formAction(new FormData());
                }}
                className="text-[0.85rem] text-ink-muted hover:text-accent"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </form>

      {state.error && <p className="mt-3 text-[0.88rem] text-danger">{state.error}</p>}
      {state.ok && <p className="mt-3 text-[0.88rem] text-ink-soft">{state.ok}</p>}

      {state.invited && (
        <div className="mt-4 rounded-xl border border-line bg-paper-deep p-4">
          <p className="text-[0.9rem] leading-relaxed text-ink">
            {state.invited.sent
              ? `Le enviamos la invitación a ${state.invited.name} por WhatsApp.`
              : `Invitación lista, pero no pudimos enviársela desde Invibot. Mándasela tú:`}
          </p>
          <p className="mt-2 break-all text-[0.82rem] text-ink-muted">{state.invited.link}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <a
              href={shareHref(state.invited.phone, state.invited.message)}
              target="_blank"
              rel="noreferrer"
              className="text-[0.85rem] text-accent hover:underline"
            >
              Enviar por mi WhatsApp
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.invited!.link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className="text-[0.85rem] text-ink-muted hover:text-accent"
            >
              {copied ? "Copiada" : "Copiar liga"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The owner putting themselves on the list, once.
 *
 * Only for accounts from before signup asked for a WhatsApp number: without
 * one there is no row to show, and the rule that the owner is always there
 * would quietly not hold.
 */
function AddMyself({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState<OrganizerState, FormData>(
    addMyself.bind(null, eventId),
    {},
  );

  return (
    <form
      action={formAction}
      className="mt-6 rounded-xl border border-line bg-paper-deep p-4"
    >
      <p className="text-[0.9rem] leading-relaxed text-ink">
        Tú siempre estás en la lista de tus eventos. Falta tu WhatsApp para agregarte.
      </p>
      <div className="mt-3 flex flex-wrap items-start gap-3">
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="Tu WhatsApp"
          required
          className="min-w-[12rem] flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[0.9rem] text-ink"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-action px-5 py-2 text-[0.85rem] text-ink-onaction disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Agregarme"}
        </button>
      </div>
      {state.error && <p className="mt-3 text-[0.88rem] text-danger">{state.error}</p>}
    </form>
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
      <td colSpan={6} className="py-3">
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
            className="rounded-full bg-action px-4 py-2 text-[0.82rem] text-ink-onaction disabled:opacity-50"
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
