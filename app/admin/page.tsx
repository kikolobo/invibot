import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { dashboardStats } from "@/lib/admin/stats";
import {
  Breakdown,
  Panel,
  Stat,
  StatGrid,
  formatMoney,
  formatNumber,
  percent,
  pricingLabels,
  sendKindLabels,
} from "./ui";

export const metadata = { title: "Dashboard" };

const dayFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * Invibot at a glance: who is here, what they are running, and what it costs
 * us in WhatsApp. Every figure links to the list it counts, where there is one.
 */
export default async function Dashboard() {
  await requireStaff();
  const { accounts, events, guests, sends, byKind, byTemplate, costs, conversation, perDay, topEvents } =
    await dashboardStats();

  const delivered = sends.total - sends.failed - sends.queued;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-6 py-12 sm:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Dashboard</h1>

      <Panel title="Cuentas">
        <StatGrid>
          <Stat label="Cuentas" value={accounts.total} href="/admin/usuarios" note={`${accounts.staff} de staff`} />
          <Stat label="Nuevas" value={accounts.new30} note={`${accounts.new7} en los últimos 7 días · 30 días`} />
          <Stat label="Activas" value={accounts.active30} note={`${percent(accounts.active30, accounts.total)} entró en 30 días`} />
          <Stat
            label="Suspendidas"
            value={accounts.suspended}
            href="/admin/usuarios?estado=suspended"
            note={`${accounts.deleted} eliminadas`}
            alert={accounts.suspended > 0}
          />
        </StatGrid>
      </Panel>

      <Panel title="Eventos e invitados">
        <StatGrid>
          <Stat label="Eventos" value={events.total} href="/admin/eventos" note={`${events.new30} creados en 30 días`} />
          <Stat
            label="Próximos"
            value={events.upcoming}
            href="/admin/eventos?estado=upcoming"
            note={`${events.upcoming30} en los próximos 30 días`}
          />
          <Stat label="Pasados" value={events.past} href="/admin/eventos?estado=past" note={`${events.archived} archivados`} />
          <Stat
            label="Suspendidos"
            value={events.suspended}
            href="/admin/eventos?estado=suspended"
            alert={events.suspended > 0}
            note={events.suspended ? "No les sale nada a sus invitados" : "Ninguno"}
          />
          <Stat label="Invitados" value={guests.approved} note={`${guests.pending} esperando aprobación`} />
          <Stat
            label="Confirmados"
            value={guests.confirmed}
            note={`${percent(guests.confirmed, guests.approved)} de los invitados · ${formatNumber(guests.seats)} personas`}
          />
          <Stat label="No van" value={guests.declined} note={`${guests.maybe} tal vez`} />
          <Stat label="Sin respuesta" value={guests.noResponse} note={`${guests.selfRegistered} llegaron por auto-registro`} />
        </StatGrid>
      </Panel>

      <Panel
        title="WhatsApp"
        note="Todo lo que mandamos queda en el registro de envíos. Plantilla es lo que Meta cobra para abrir conversación; libre es lo que va dentro de la ventana de 24 horas."
      >
        <StatGrid>
          <Stat label="Envíos" value={sends.total} note={`${formatNumber(sends.last30)} en 30 días · ${formatNumber(sends.last7)} en 7`} />
          <Stat label="Con plantilla" value={sends.template} note={percent(sends.template, sends.total)} />
          <Stat label="Libres" value={sends.freeform} note={percent(sends.freeform, sends.total)} />
          <Stat
            label="Entregados"
            value={sends.delivered}
            note={`${percent(sends.delivered, delivered)} de los enviados · ${percent(sends.read, sends.delivered)} leídos`}
          />
          <Stat
            label="Fallidos"
            value={sends.failed}
            alert={sends.failed > 0}
            note={`${percent(sends.failed, sends.total)} del total · ${formatNumber(sends.queued)} en cola`}
          />
          <Stat label="Mensajes recibidos" value={conversation.inbound} note={`${formatNumber(conversation.inbound30)} en 30 días`} />
          <Stat
            label="Respuestas del asistente"
            value={conversation.ai}
            note={`${formatNumber(conversation.tokensIn + conversation.tokensOut)} tokens`}
          />
          <Stat
            label="Preguntas abiertas"
            value={conversation.openQuestions}
            alert={conversation.openQuestions > 0}
            note={`${formatNumber(conversation.unmatched)} mensajes de números desconocidos`}
          />
        </StatGrid>
      </Panel>

      <div className="grid gap-10 lg:grid-cols-2">
        <Panel title="Por tipo">
          <Breakdown
            head={["Tipo", "Envíos", "Fallidos"]}
            rows={byKind.map((row) => [sendKindLabels[row.kind] ?? row.kind, row.n, row.failed])}
          />
        </Panel>
        <Panel title="Por plantilla">
          <Breakdown
            head={["Plantilla", "Envíos", "30 días", "Fallidos"]}
            rows={byTemplate.map((row) => [
              <code key="t" className="text-[0.82rem]">{row.template}</code>,
              row.n,
              row.last30,
              row.failed,
            ])}
          />
        </Panel>
        <Panel title="Costo" note="Lo que Meta reporta por cada envío entregado, cuando lo reporta.">
          <Breakdown
            head={["Categoría", "Envíos", "Costo"]}
            rows={costs.map((row) => [
              row.category ? (pricingLabels[row.category] ?? row.category) : "Sin categoría",
              row.n,
              row.cost ? formatMoney(row.cost, row.currency) : "—",
            ])}
          />
        </Panel>
        <Panel title="Últimos 14 días" note="Por día, hora de la Ciudad de México.">
          <Breakdown
            head={["Día", "Envíos", "Recibidos"]}
            rows={perDay.map((row) => [dayFmt.format(new Date(`${row.day}T00:00:00Z`)), row.sends, row.inbound])}
          />
        </Panel>
      </div>

      <Panel title="Eventos con más envíos" note="En los últimos 30 días.">
        <Breakdown
          head={["Evento", "Envíos"]}
          rows={topEvents.map((row) => [
            <Link key="e" href={`/admin/eventos/${row.id}`} className="hover:text-accent">
              {row.name}
              {row.owner && <span className="block text-[0.8rem] text-ink-muted">{row.owner}</span>}
            </Link>,
            row.n,
          ])}
        />
      </Panel>
    </div>
  );
}
