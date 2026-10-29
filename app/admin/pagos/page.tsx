import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { listPayments, salesStats, type PaymentFilter } from "@/lib/admin/payments";
import { stripeMode } from "@/lib/billing/stripe";
import { formatDate } from "../format";
import { Breakdown, Panel, Stat, StatGrid, formatMoney, formatNumber, paymentMethodLabels, paymentStatusLabels } from "../ui";

export const metadata = { title: "Pagos" };

const FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "paid", label: "Pagados" },
  { value: "pending", label: "Esperando" },
  { value: "closed", label: "Fallidos o vencidos" },
];

const isFilter = (value: unknown): value is PaymentFilter => FILTERS.some((f) => f.value === value);

export default async function Pagos({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; pagina?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const filter = isFilter(params.estado) ? params.estado : "all";
  const page = Math.max(1, Number(params.pagina) || 1);

  const [{ sales }, rows] = await Promise.all([salesStats(), listPayments({ filter, page })]);
  const currency = sales.currency ?? "MXN";
  const mode = stripeMode();

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-6 py-12 sm:px-10">
      <div>
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Pagos</h1>
        <p className="mt-3 text-ink-soft">
          {mode === null
            ? "Stripe no está configurado en este entorno: falta STRIPE_SECRET_KEY."
            : mode === "test"
              ? "Stripe en modo de prueba: nada de esto es dinero real."
              : "Stripe en modo real."}
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
        <Breakdown
          head={["Evento", "Lugares", "Monto", "Estado"]}
          empty="Ningún pago todavía."
          rows={rows.map((row) => [
            <span key="e">
              <Link href={`/admin/eventos/${row.eventId}`} className="hover:text-accent">
                {row.eventName}
              </Link>
              <span className="block text-[0.8rem] text-ink-muted">
                <Link href={`/admin/usuarios/${row.ownerId}`} className="hover:text-accent">
                  {row.ownerName || row.ownerEmail}
                </Link>{" "}
                · {formatDate(row.paidAt ?? row.createdAt)}
              </span>
            </span>,
            row.slots,
            formatMoney(row.amountMinor, row.currency),
            <span key="s">
              {paymentStatusLabels[row.status] ?? row.status}
              {row.method && (
                <span className="block text-[0.8rem] text-ink-muted">
                  {paymentMethodLabels[row.method] ?? row.method}
                </span>
              )}
            </span>,
          ])}
        />
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
