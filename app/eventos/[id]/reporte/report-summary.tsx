import type { ReportSummary as Summary } from "@/lib/reports/guest-report";

/**
 * Where the event stands, above the filters.
 *
 * Counted over the whole list rather than the current filter — it describes the
 * event, so it should not move when you click "Cancelados".
 */
export function ReportSummary({ summary }: { summary: Summary }) {
  const rows: { label: string; value: number; note?: string; strong?: boolean }[] = [
    { label: "Invitación enviada", value: summary.enviadas },
    { label: "Sin enviar todavía", value: summary.sinEnviar },
    { label: "Confirmados", value: summary.confirmados, strong: true },
    { label: "Lugares confirmados", value: summary.lugares, note: "contando acompañantes", strong: true },
    { label: "Sin leer", value: summary.sinLeer, note: "les llegó y no la han abierto" },
    { label: "Sin confirmar", value: summary.sinConfirmar, note: "la leyeron y no han contestado" },
    { label: "Cancelados", value: summary.cancelados, note: "dijeron que no podrán" },
  ];

  return (
    <dl className="mt-6 grid gap-x-8 gap-y-4 border-y border-line py-5 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline gap-3">
          <dd
            className={`font-display text-2xl tabular-nums ${
              row.strong ? "text-accent" : "text-ink"
            }`}
          >
            {row.value}
          </dd>
          <dt className="min-w-0">
            <span className="block text-[0.9rem] leading-tight text-ink">{row.label}</span>
            {row.note && (
              <span className="block text-[0.78rem] leading-tight text-ink-muted">{row.note}</span>
            )}
          </dt>
        </div>
      ))}
    </dl>
  );
}
