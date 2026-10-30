import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { eventLog, eventStateLabels, eventStateOf, getEventDetail } from "@/lib/admin/events";
import { auditLabels, type AuditAction } from "@/lib/admin/audit";
import { describeDetail } from "@/lib/admin/describe";
import { stripeAccountIds } from "@/lib/billing/stripe";
import {
  impersonateUser,
  setEventLimit,
  suspendEvent,
  unsuspendEvent,
} from "@/lib/admin/actions";
import { statusLabels as broadcastStatusLabels, type BroadcastStatus } from "@/lib/broadcasts/labels";
import { formatPhone } from "@/lib/phone";
import { AdminForm, Field } from "../../admin-form";
import { AdjustPlaces } from "./adjust-places";
import { ModeBadge, PaymentActions, PaymentStatus } from "../../payment-actions";
import { formatDate, formatDateTime } from "../../format";
import {
  Breakdown,
  Panel,
  Stat,
  StatGrid,
  formatMoney,
  formatNumber,
  formatUsd,
  paymentMethodLabels,
  paymentStatusLabels,
  percent,
  sendKindLabels,
  tabBody,
} from "../../ui";

export const metadata = { title: "Evento" };

const TABS = [
  { key: "lugares", label: "Lugares" },
  { key: "pagos", label: "Pagos" },
  { key: "estadisticas", label: "Estadísticas" },
  { key: "logs", label: "Logs" },
  { key: "ajustes", label: "Ajustes" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const crewRoles: Record<string, string> = {
  admin: "Admin",
  guest_manager: "Gestor de invitados",
  organizer: "Organizador (sólo WhatsApp)",
};

const lifecycle: Record<string, string> = {
  draft: "Borrador",
  ready: "Listo",
  sending: "Enviando",
  live: "En curso",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

export default async function Evento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  const { tab: requested } = await searchParams;
  const detail = await getEventDetail(id);
  if (!detail) notFound();

  const { event, guests, sends, conversation, limit } = detail;
  const state = eventStateOf(event);
  const isAdmin = staff.role === "admin";
  const sent = sends.total - sends.failed - sends.queued;

  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : "lugares";
  const log = tab === "logs" ? await eventLog(event.id) : [];
  const accounts = tab === "pagos" ? await stripeAccountIds() : undefined;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <div>
        <Link href="/admin/eventos" className="text-[0.88rem] text-ink-muted hover:text-accent">
          ← Eventos
        </Link>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="font-display text-4xl text-ink">{event.name}</h1>
          <span
            className={`rounded-full border px-3 py-0.5 text-[0.8rem] ${
              state === "suspended" ? "border-danger text-danger" : "border-line text-ink-soft"
            }`}
          >
            {eventStateLabels[state]}
          </span>
          <span className="rounded-full border border-line px-3 py-0.5 text-[0.8rem] text-ink-soft">
            {lifecycle[event.status] ?? event.status}
          </span>
        </div>
        <p className="mt-3 text-ink-soft">
          {formatDateTime(event.startsAt)}
          {event.venueName && ` · ${event.venueName}`}
        </p>
        <p className="mt-1 text-[0.88rem] text-ink-muted">
          De{" "}
          <Link href={`/admin/usuarios/${detail.ownerId}`} className="hover:text-accent">
            {detail.ownerName || detail.ownerEmail}
          </Link>
          {detail.ownerPhone && ` · ${formatPhone(detail.ownerPhone)}`} · creado {formatDate(event.createdAt)}
          {event.autoRegisterEnabled && " · auto-registro abierto"}
        </p>
        {event.suspendedAt && (
          <p className="mt-4 max-w-xl rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-[0.9rem] text-ink">
            Suspendido el {formatDate(event.suspendedAt)}: {event.suspendedReason}. No sale ningún mensaje a
            sus invitados y sus mensajes programados esperan.
          </p>
        )}
      </div>


      <nav className="mt-8 flex flex-wrap gap-1 border-b border-line" aria-label="Secciones del evento">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/eventos/${event.id}?tab=${item.key}`}
            aria-current={item.key === tab ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[0.92rem] transition-colors ${
              item.key === tab ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className={`mt-10 space-y-10 ${tabBody}`}>
        {tab === "lugares" && (
          <>
            <Panel
              title="Lugares"
              note={
                detail.ownerExempt
                  ? "Su dueño es de cortesía: este evento envía sin pagar."
                  : "Un invitado ocupa un lugar la primera vez que le escribimos, y lo conserva. Sin lugares disponibles no sale nada a los que todavía no tienen uno."
              }
            >
              {detail.slots && (
                // The whole sum in one line, the way it is worked out.
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.95rem] text-ink-soft">
                  <span>
                    <span className="font-display text-2xl tabular-nums text-ink">{detail.slots.paid}</span> pagados
                  </span>
                  <span className="text-ink-muted">+</span>
                  <span>
                    <span className="font-display text-2xl tabular-nums text-ink">{detail.slots.gifted}</span> de regalo
                  </span>
                  <span className="text-ink-muted">·</span>
                  <span>
                    <span className="font-display text-2xl tabular-nums text-ink">{detail.slots.used}</span> usados
                  </span>
                  <span className="text-ink-muted">·</span>
                  <span className={!detail.ownerExempt && detail.slots.waiting > detail.slots.available ? "text-danger" : ""}>
                    <span className="font-display text-2xl tabular-nums">
                      {detail.ownerExempt ? "∞" : detail.slots.available}
                    </span>{" "}
                    disponibles
                  </span>
                  {detail.slots.waiting > 0 && (
                    <span className="text-[0.85rem] text-ink-muted">
                      ({formatNumber(detail.slots.waiting)} invitados aprobados esperan lugar)
                    </span>
                  )}
                </p>
              )}

              {isAdmin && (
                <div className="mt-8 rounded-xl border border-line p-5">
                  <p className="mb-4 font-display text-lg text-ink">Ajustar lugares</p>
                  <AdjustPlaces eventId={event.id} gifted={detail.slots?.gifted ?? 0} />
                </div>
              )}

            </Panel>
          </>
        )}

        {tab === "pagos" && (
          <>
            <Panel title="Pagos" note="Cada pago dice si fue en Sandbox o en Live; su menú ⋯ reembolsa o cancela con las llaves de ese mismo modo.">
              <div>
                {detail.purchases.length === 0 ? (
                  <p className="text-[0.9rem] text-ink-muted">Ninguno todavía.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {detail.purchases.map((payment) => (
                      <li key={payment.id} className="flex items-center gap-3 px-4 py-3 text-[0.9rem]">
                        <span className="min-w-0 flex-1 text-ink">
                          {payment.slots} lugares · {formatMoney(payment.amountMinor, payment.currency)}{" "}
                          <ModeBadge payment={payment} />
                          <span className="block text-[0.8rem] text-ink-muted">
                            {formatDate(payment.paidAt ?? payment.createdAt)}
                            {payment.method &&
                              payment.method !== "manual" &&
                              ` · ${paymentMethodLabels[payment.method] ?? payment.method}`}
                            {payment.note && ` · ${payment.note}`}
                          </span>
                        </span>
                        <PaymentStatus
                        payment={payment}
                        label={paymentStatusLabels[payment.status] ?? payment.status}
                        accounts={accounts}
                      />
                        <span className="w-8">{isAdmin && <PaymentActions payment={payment} />}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          </>
        )}

        {tab === "estadisticas" && (
          <>
            <Panel title="Invitados">
              <StatGrid>
                <Stat
                  label="Invitados"
                  value={guests.approved}
                  note={
                    limit.max === null
                      ? "Sin límite"
                      : `Límite ${formatNumber(limit.max)} · quedan ${formatNumber(limit.remaining)}`
                  }
                  alert={limit.max !== null && limit.remaining === 0}
                />
                <Stat
                  label="Confirmados"
                  value={guests.confirmed}
                  note={`${percent(guests.confirmed, guests.approved)} · ${formatNumber(guests.seats)} personas`}
                />
                <Stat label="No van" value={guests.declined} note={`${guests.maybe} tal vez`} />
                <Stat label="Sin respuesta" value={guests.noResponse} />
                <Stat label="Invitación enviada" value={guests.invited} note={percent(guests.invited, guests.approved)} />
                <Stat
                  label="Invitación fallida"
                  value={guests.inviteFailed}
                  alert={guests.inviteFailed > 0}
                  note={`${guests.noPhone} sin teléfono`}
                />
                <Stat
                  label="Esperando aprobación"
                  value={guests.pending}
                  note={`${guests.selfRegistered} por auto-registro · ${guests.rejected} rechazados`}
                />
                <Stat label="Pidieron baja" value={guests.optedOut} />
              </StatGrid>
            </Panel>

            <Panel title="WhatsApp">
              <StatGrid>
                <Stat
                  label="Envíos"
                  value={sends.total}
                  note={sends.last ? `Último ${formatDateTime(sends.last)}` : "Ninguno todavía"}
                />
                <Stat label="Con plantilla" value={sends.template} note={`${formatNumber(sends.freeform)} libres`} />
                <Stat
                  label="Entregados"
                  value={sends.delivered}
                  note={`${percent(sends.delivered, sent)} · ${percent(sends.read, sends.delivered)} leídos`}
                />
                <Stat
                  label="Fallidos"
                  value={sends.failed}
                  alert={sends.failed > 0}
                  note={`${formatNumber(sends.queued)} en cola`}
                />
                <Stat
                  label="Mensajes recibidos"
                  value={conversation.inbound}
                  note={
                    conversation.lastInbound
                      ? `Último ${formatDateTime(conversation.lastInbound)}`
                      : `${formatNumber(conversation.conversations)} conversaciones`
                  }
                />
                <Stat label="Respuestas del asistente" value={conversation.ai} />
                <Stat
                  label="Preguntas abiertas"
                  value={conversation.openQuestions}
                  alert={conversation.openQuestions > 0}
                  note={`${formatNumber(conversation.answeredQuestions)} contestadas`}
                />
                <Stat label="Costo reportado" value={sends.cost ? formatMoney(sends.cost, sends.currency) : "—"} />
                <Stat
                  label="Costo del asistente"
                  value={formatUsd(detail.ai.cost)}
                  note={`${formatNumber(detail.ai.replies)} respuestas · ${formatNumber(detail.ai.simulator)} en simulador`}
                />
                <Stat
                  label="Asistente por invitado"
                  value={detail.ai.guests ? formatUsd(detail.ai.cost / detail.ai.guests) : "—"}
                  note={`${formatNumber(detail.ai.guests)} invitados atendidos`}
                />
              </StatGrid>
            </Panel>

            <div className="grid gap-10 lg:grid-cols-2">
              <Panel title="Envíos por tipo">
                <Breakdown
                  head={["Tipo", "Envíos", "Fallidos"]}
                  rows={detail.byKind.map((row) => [sendKindLabels[row.kind] ?? row.kind, row.n, row.failed])}
                />
              </Panel>
              <Panel title="Por plantilla">
                <Breakdown
                  head={["Plantilla", "Envíos", "Fallidos"]}
                  rows={detail.byTemplate.map((row) => [
                    <code key="t" className="text-[0.82rem]">{row.template}</code>,
                    row.n,
                    row.failed,
                  ])}
                />
              </Panel>
            </div>

            <Panel title="Por qué fallaron" note="Los errores que devolvió Meta, agrupados. Es lo primero que hay que ver cuando alguien dice que no le llegó.">
              <Breakdown
                head={["Error", "Veces", "Último"]}
                empty="Ningún envío fallido."
                rows={detail.failures.map((row) => [
                  <span key="e">
                    {row.code ? <code className="text-[0.82rem]">{row.code}</code> : "Sin código"}
                    {row.title && <span className="block text-[0.82rem] text-ink-muted">{row.title}</span>}
                  </span>,
                  row.n,
                  formatDate(row.last),
                ])}
              />
            </Panel>

            <Panel title={`Organizadores (${detail.crew.length})`}>
              <Breakdown
                head={["Persona", "Rol"]}
                empty="Nadie."
                rows={detail.crew.map((person) => [
                  <span key="p">
                    {person.userId ? (
                      <Link href={`/admin/usuarios/${person.userId}`} className="hover:text-accent">
                        {person.fullName}
                      </Link>
                    ) : (
                      person.fullName
                    )}
                    <span className="block text-[0.8rem] text-ink-muted">
                      {formatPhone(person.phone)}
                      {person.lastInboundAt && ` · escribió ${formatDate(person.lastInboundAt)}`}
                    </span>
                  </span>,
                  <span key="r">
                    {person.isOwner ? "Dueño" : (crewRoles[person.role] ?? person.role)}
                    {person.isResponder && <span className="block text-[0.8rem] text-ink-muted">Responde a invitados</span>}
                  </span>,
                ])}
              />
            </Panel>
          </>
        )}

        {tab === "logs" && (
          <>
            <Panel title="Lo que hizo el staff" note="Pagos registrados, reembolsos y cancelaciones, lugares regalados o quitados, límites y suspensiones de este evento.">
              {log.length === 0 ? (
                <p className="text-[0.9rem] text-ink-muted">Nadie del staff ha tocado este evento.</p>
              ) : (
                <ol className="space-y-3 border-l border-line pl-5 text-[0.88rem]">
                  {log.map((entry) => (
                    <li key={entry.id}>
                      <span className="text-[0.75rem] uppercase tracking-wide text-ink-muted">
                        {formatDateTime(entry.createdAt)} · {entry.actorName || entry.actorEmail || "script"}
                      </span>
                      <span className="block text-ink">{auditLabels[entry.action as AuditAction] ?? entry.action}</span>
                      {describeDetail(entry.detail) && (
                        <span className="block text-ink-muted">{describeDetail(entry.detail)}</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
            <Panel title="Mensajes a invitados">
              <Breakdown
                head={["Mensaje", "Personas", "Estado"]}
                empty="Ninguno."
                rows={detail.messages.map((message) => [
                  <span key="m">
                    {message.title}
                    <span className="block text-[0.8rem] text-ink-muted">
                      {message.sentAt
                        ? `Enviado ${formatDate(message.sentAt)}`
                        : message.scheduledFor
                          ? `Para ${formatDate(message.scheduledFor)}`
                          : `Creado ${formatDate(message.createdAt)}`}
                    </span>
                  </span>,
                  message.recipients,
                  broadcastStatusLabels[message.status as BroadcastStatus] ?? message.status,
                ])}
              />
            </Panel>
          </>
        )}

        {tab === "ajustes" && (
          <>
            {isAdmin ? (
              <>

                <Panel
                  title="Límite de invitados"
                  note={`Vacío sigue el límite de su dueño (${
                    detail.ownerMaxGuests === null ? "sin límite" : `${formatNumber(detail.ownerMaxGuests)} por evento`
                  }). Un número aquí manda sobre ese, para más o para menos; no quita a nadie que ya esté en la lista.`}
                >
                  <AdminForm action={setEventLimit} submit="Guardar límite" className="max-w-xs space-y-4">
                    <input type="hidden" name="eventId" value={event.id} />
                    <Field
                      label="Máximo de invitados"
                      name="maxGuests"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      defaultValue={event.maxGuests ?? ""}
                      placeholder="Sin límite propio"
                    />
                  </AdminForm>
                </Panel>

                <Panel
                  title="Suspender"
                  note="Para el evento sin borrar nada: no sale ningún mensaje a sus invitados (invitaciones, recordatorios, pases, ni respuestas del asistente), el auto-registro se cierra y sus organizadores ven un aviso. Reactivarlo lo deja como estaba."
                >
                  {event.suspendedAt ? (
                    <AdminForm action={unsuspendEvent} submit="Reactivar evento" busy="Reactivando…">
                      <input type="hidden" name="eventId" value={event.id} />
                    </AdminForm>
                  ) : (
                    <AdminForm
                      action={suspendEvent}
                      submit="Suspender evento"
                      busy="Suspendiendo…"
                      tone="danger"
                      confirm="Sus invitados dejan de recibir mensajes desde ahora."
                      className="max-w-sm space-y-4"
                    >
                      <input type="hidden" name="eventId" value={event.id} />
                      <Field label="Motivo" name="reason" required hint="Lo va a leer quien lo reactive." />
                    </AdminForm>
                  )}
                </Panel>

                <Panel
                  title="Ver como el dueño"
                  note="Abre la app como su dueño durante una hora, para ver exactamente lo que ve. Queda en Actividad."
                >
                  <AdminForm
                    action={impersonateUser}
                    userId={detail.ownerId}
                    submit="Ver como el dueño"
                    busy="Entrando…"
                    tone="quiet"
                  />
                </Panel>
              </>
            ) : (
              <p className="text-[0.9rem] text-ink-muted">Sólo un admin puede cambiar estos ajustes.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
