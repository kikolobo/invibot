import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { eventStateLabels, eventStateOf, getEventDetail } from "@/lib/admin/events";
import {
  adjustPayment,
  giftSlots,
  impersonateUser,
  recordPayment,
  setEventLimit,
  suspendEvent,
  unsuspendEvent,
} from "@/lib/admin/actions";
import { statusLabels as broadcastStatusLabels, type BroadcastStatus } from "@/lib/broadcasts/labels";
import { formatPhone } from "@/lib/phone";
import { AdminForm, Field } from "../../admin-form";
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
} from "../../ui";

export const metadata = { title: "Evento" };

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

export default async function Evento({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const detail = await getEventDetail(id);
  if (!detail) notFound();

  const { event, guests, sends, conversation, limit } = detail;
  const state = eventStateOf(event);
  const isAdmin = staff.role === "admin";
  const sent = sends.total - sends.failed - sends.queued;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-6 py-12 sm:px-10">
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
          <p className="mt-4 max-w-xl rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-[0.9rem] text-ink">
            Suspendido el {formatDate(event.suspendedAt)}: {event.suspendedReason}. No sale ningún mensaje a
            sus invitados y sus mensajes programados esperan.
          </p>
        )}
      </div>

      {isAdmin && (
        <AdminForm
          action={impersonateUser}
          userId={detail.ownerId}
          submit="Ver como el dueño"
          busy="Entrando…"
          tone="quiet"
        />
      )}

      <Panel
        title="Pagos"
        note={
          detail.ownerExempt
            ? "Su dueño es de cortesía: este evento envía sin pagar."
            : "Un invitado ocupa un lugar la primera vez que le escribimos. Sin lugares disponibles, no sale nada a los invitados que no tienen uno."
        }
      >
        {detail.slots && (
          <StatGrid>
            <Stat label="Pagados" value={detail.slots.paid} />
            <Stat label="De regalo" value={detail.slots.gifted} />
            <Stat label="Usados" value={detail.slots.used} />
            <Stat
              label="Disponibles"
              value={detail.ownerExempt ? "∞" : detail.slots.available}
              alert={!detail.ownerExempt && detail.slots.waiting > detail.slots.available}
              note={`${formatNumber(detail.slots.waiting)} invitados aprobados sin lugar`}
            />
            <Stat
              label="Costo del asistente"
              value={formatUsd(detail.ai.cost)}
              note={`${formatNumber(detail.ai.replies)} respuestas · ${formatNumber(detail.ai.simulator)} en simulador`}
            />
            <Stat
              label="Por invitado"
              value={detail.ai.guests ? formatUsd(detail.ai.cost / detail.ai.guests) : "—"}
              note={`${formatNumber(detail.ai.guests)} invitados atendidos`}
            />
          </StatGrid>
        )}
        {detail.purchases.length > 0 && (
          <ul className="mt-6 divide-y divide-line rounded-xl border border-line">
            {detail.purchases.map((payment) => {
              const fromStripe = payment.method !== "manual" && Boolean(payment.stripePaymentIntentId);
              const active = payment.status === "paid" || payment.status === "pending";
              return (
                <li key={payment.id} className="px-4 py-3 text-[0.9rem]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-ink">
                      {payment.slots} lugares · {formatMoney(payment.amountMinor, payment.currency)}
                      <span className="block text-[0.8rem] text-ink-muted">
                        {formatDate(payment.paidAt ?? payment.createdAt)}
                        {payment.method && ` · ${paymentMethodLabels[payment.method] ?? payment.method}`}
                        {payment.note && ` · ${payment.note}`}
                      </span>
                    </span>
                    <span className={payment.status === "paid" ? "text-ink-soft" : "text-ink-muted"}>
                      {paymentStatusLabels[payment.status] ?? payment.status}
                    </span>
                  </div>
                  {isAdmin && active && (
                    // Folded away: these move money and places, and should take
                    // a deliberate click to reach.
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[0.82rem] text-ink-muted hover:text-accent">
                        {payment.status === "paid" ? "Cancelar o reembolsar" : "Cancelar"}
                      </summary>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        {payment.status === "paid" && fromStripe && (
                          <AdminForm
                            action={adjustPayment}
                            submit="Reembolsar y cancelar"
                            busy="Reembolsando…"
                            tone="danger"
                            confirm={`Devolver ${formatMoney(payment.amountMinor, payment.currency)} por Stripe y quitar ${payment.slots} lugares.`}
                            className="space-y-3"
                          >
                            <input type="hidden" name="paymentId" value={payment.id} />
                            <input type="hidden" name="mode" value="refund" />
                            <Field label="Motivo" name="reason" required />
                          </AdminForm>
                        )}
                        <AdminForm
                          action={adjustPayment}
                          submit={payment.status === "paid" ? "Cancelar sin reembolso" : "Cancelar pago pendiente"}
                          busy="Cancelando…"
                          tone="quiet"
                          confirm={
                            payment.status === "paid"
                              ? `Quitar ${payment.slots} lugares sin devolver dinero${fromStripe ? "" : " (si hubo, devuélvelo por donde llegó)"}.`
                              : "Su ficha de OXXO o liga de pago deja de servir."
                          }
                          className="space-y-3"
                        >
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <input type="hidden" name="mode" value="cancel" />
                          <Field label="Motivo" name="reason" required />
                        </AdminForm>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {isAdmin && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <AdminForm action={recordPayment} submit="Registrar pago" className="space-y-3 rounded-xl border border-line p-5">
              <p className="font-display text-lg text-ink">Pago fuera de Stripe</p>
              <p className="text-[0.82rem] text-ink-muted">Una transferencia directa o efectivo: suma lugares pagados.</p>
              <input type="hidden" name="eventId" value={event.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lugares" name="slots" type="number" min={1} inputMode="numeric" required />
                <Field label="Monto (MXN)" name="amount" type="number" min={0} step="0.01" inputMode="decimal" required />
              </div>
              <Field label="De dónde vino" name="note" required placeholder="Transferencia BBVA del 30 de octubre" />
            </AdminForm>
            <AdminForm action={giftSlots} submit="Guardar" className="space-y-3 rounded-xl border border-line p-5">
              <p className="font-display text-lg text-ink">Lugares de cortesía</p>
              <p className="text-[0.82rem] text-ink-muted">Positivo para regalar, negativo para quitar los que no se hayan usado.</p>
              <input type="hidden" name="eventId" value={event.id} />
              <Field label="Lugares" name="slots" type="number" inputMode="numeric" required />
              <Field label="Motivo" name="reason" required hint="Queda en el historial." />
            </AdminForm>
          </div>
        )}
      </Panel>

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

      <div className="grid gap-10 lg:grid-cols-2">
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
      </div>

      {isAdmin && (
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
        </>
      )}
    </div>
  );
}
