import Link from "next/link";

/**
 * The console's building blocks. Numbers wear ink, never color: a figure is
 * read, and the one place color carries meaning — red for something wrong —
 * comes with words saying what.
 */

const nf = new Intl.NumberFormat("es-MX");
export const formatNumber = (value: number | null | undefined) => nf.format(value ?? 0);

export const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";

export function Stat({
  label,
  value,
  note,
  href,
  alert = false,
}: {
  label: string;
  value: number | string;
  note?: string;
  href?: string;
  /** For a count that means something needs attention. Says so in the note too. */
  alert?: boolean;
}) {
  const body = (
    <>
      <span className="text-[0.78rem] uppercase tracking-wide text-ink-muted">{label}</span>
      <span
        className={`mt-1 block font-display text-3xl tabular-nums ${alert ? "text-danger" : "text-ink"}`}
      >
        {typeof value === "number" ? formatNumber(value) : value}
      </span>
      {note && <span className="mt-1 block text-[0.8rem] text-ink-soft">{note}</span>}
    </>
  );
  const box = "block rounded-xl border border-line bg-paper-deep px-4 py-4";
  return href ? (
    <Link href={href} className={`${box} transition-colors hover:border-accent`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

export function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      {note && <p className="mt-2 max-w-xl text-[0.88rem] leading-relaxed text-ink-muted">{note}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A small breakdown: a label column and right-aligned figures. */
export function Breakdown({
  head,
  rows,
  empty = "Nada todavía.",
}: {
  head: string[];
  rows: (string | number | React.ReactNode)[][];
  empty?: string;
}) {
  if (!rows.length) return <p className="text-[0.9rem] text-ink-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-[0.88rem]">
        <thead className="bg-paper-deep text-[0.75rem] uppercase tracking-wide text-ink-muted">
          <tr>
            {head.map((cell, index) => (
              <th key={index} className={`px-4 py-2.5 font-normal ${index ? "text-right" : ""}`}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-line">
              {row.map((cell, column) => (
                <td
                  key={column}
                  className={`px-4 py-2.5 ${column ? "text-right tabular-nums text-ink-soft" : "text-ink"}`}
                >
                  {typeof cell === "number" ? formatNumber(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const sendKindLabels: Record<string, string> = {
  save_the_date: "Save the date",
  invite: "Invitación",
  reminder: "Recordatorio",
  rsvp_confirmation: "Confirmación",
  logistics: "Logística",
  organizer_relay: "Respuesta del organizador",
  custom: "Asistente / libre",
  pass: "Pase QR",
  broadcast: "Mensaje a invitados",
  auto_register: "Auto-registro",
};

export const paymentStatusLabels: Record<string, string> = {
  pending: "Esperando pago",
  paid: "Pagado",
  failed: "No se completó",
  expired: "Venció",
};

export const paymentMethodLabels: Record<string, string> = {
  card: "Tarjeta",
  oxxo: "OXXO",
  customer_balance: "SPEI",
};

/** Claude's cost is kept in millionths of a dollar. */
export const formatUsd = (micro: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: micro < 1_000_000 ? 4 : 2,
  }).format(micro / 1_000_000);

export const pricingLabels: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utilidad",
  service: "Servicio",
  authentication: "Autenticación",
};

/** Meta reports cost in minor units; shown in the currency it came in. */
export const formatMoney = (minor: number, currency: string | null) =>
  currency
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(minor / 100)
    : "—";
