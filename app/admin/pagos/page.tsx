import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { listPayments, salesStats, type PaymentFilter } from "@/lib/admin/payments";
import { activeMode, configuredModes } from "@/lib/billing/stripe";
import { formatDate } from "../format";
import { ModeBadge, PaymentActions } from "../payment-actions";
import { Panel, Stat, StatGrid, formatMoney, formatNumber, paymentMethodLabels, paymentStatusLabels } from "../ui";

export const metadata = { title: "Pagos" };

const FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "paid", label: "Pagados" },
  { value: "pending", label: "Esperando" },
  { value: "closed", label: "Cancelados, reembolsados o vencidos" },
];

const isFilter = (value: unknown): value is PaymentFilter => FILTERS.some((f) => f.value === value);

export default async function Pagos({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; pagina?: string }>;
}) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const params = await searchParams;
  const filter = isFilter(params.estado) ? params.estado : "all";
  const page = Math.max(1, Number(params.pagina) || 1);

  const [{ sales }, rows] = await Promise.all([salesStats(), listPayments({ filter, page })]);
  const currency = sales.currency ?? "MXN";
  const mode = await activeMode();
  const ready = configuredModes()[mode];

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-6 py-12 sm:px-10">
      <div>
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Pagos</h1>
        <p className="mt-3 text-ink-soft">
          {!ready
            ? `Faltan las llaves de Stripe para el modo ${mode === "live" ? "Live" : "Sandbox"}. Ve a Configuración → Pagos.`
            : mode === "test"
              ? "Cobrando en Sandbox: los pagos son de prueba y no cuentan en las ventas."
              : "Cobrando en Live: dinero real."}
        </p>
      </div>

      <StatGrid>
        <Stat label="Ventas" value={formatMoney(sales.revenue, currency)} note={`${formatNumber(sales.paid)} pagos · ${formatNumber(sales.customers)} clientes`} />
        <Stat label="Últimos 30 días" value={formatMoney(sales.revenue30, currency)} />
        <Stat label="Lugares vendidos" value={sales.slotsSold} />
        <Stat
          label="Esperando pago"
          value={formatMoney(sales.pendingAmount, currency)}
          note={`${formatNumber(sales.pending)} en OXXO, SPEI o sin terminar`}
        />
      </StatGrid>

      <Panel title="Movimientos">
        <nav className="mb-6 flex flex-wrap gap-2 text-[0.85rem]">
          {FILTERS.map((option) => (
            <Link
              key={option.value}
              href={option.value === "all" ? "/admin/pagos" : `/admin/pagos?estado=${option.value}`}
              className={`rounded-full border px-3 py-1 ${
                option.value === filter ? "border-accent text-accent" : "border-line text-ink-soft hover:border-accent"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <p className="text-[0.9rem] text-ink-muted">Ningún pago todavía.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-4 px-4 py-3 text-[0.9rem]">
                <span className="min-w-0 flex-1">
                  <Link href={`/admin/eventos/${row.eventId}`} className="text-ink hover:text-accent">
                    {row.eventName}
                  </Link>
                  <span className="block text-[0.8rem] text-ink-muted">
                    <Link href={`/admin/usuarios/${row.ownerId}`} className="hover:text-accent">
                      {row.ownerName || row.ownerEmail}
                    </Link>{" "}
                    · {formatDate(row.paidAt ?? row.createdAt)}
                    {row.note && ` · ${row.note}`}
                  </span>
                </span>
                <span className="hidden w-24 text-right tabular-nums text-ink-soft sm:block">{row.slots} lugares</span>
                <span className="w-28 text-right tabular-nums text-ink">{formatMoney(row.amountMinor, row.currency)}</span>
                <span className="w-36 text-right">
                  <span className="text-ink-soft">{paymentStatusLabels[row.status] ?? row.status}</span>
                  <span className="mt-0.5 flex items-center justify-end gap-1.5 text-[0.78rem] text-ink-muted">
                    {row.method && row.method !== "manual" && (paymentMethodLabels[row.method] ?? row.method)}
                    <ModeBadge payment={row} />
                  </span>
                </span>
                <span className="w-8">{isAdmin && <PaymentActions payment={row} />}</span>
              </li>
            ))}
          </ul>
        )}
        <nav className="mt-6 flex justify-between text-[0.88rem] text-ink-soft">
          {page > 1 ? (
            <Link href={`/admin/pagos?${filter !== "all" ? `estado=${filter}&` : ""}pagina=${page - 1}`}>← Más recientes</Link>
          ) : (
            <span />
          )}
          {rows.length === 50 ? (
            <Link href={`/admin/pagos?${filter !== "all" ? `estado=${filter}&` : ""}pagina=${page + 1}`}>Anteriores →</Link>
          ) : (
            <span />
          )}
        </nav>
      </Panel>
    </div>
  );
}
