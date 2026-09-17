import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/session";
import { loadReport, type ReportQuery } from "@/lib/reports/load";
import { loadReportPreset } from "@/lib/reports/presets";
import { ReportSheet } from "@/components/report-sheet";
import { ReportControls } from "./report-controls";
import { ReportSummary } from "./report-summary";

export const metadata = { title: "Reporte" };

export default async function Reporte({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ReportQuery>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { orgId } = await requireOrg();

  // Arriving with no parameters means "however I left it", not "the defaults".
  const saved = Object.keys(query).length === 0 ? await loadReportPreset(id) : null;
  const report = await loadReport(id, orgId, saved ?? query);
  if (!report) notFound();

  return (
    <div>
      <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">Reporte</h1>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
        La lista para quien recibe en la puerta. Filtra, ordénala como la vayas a leer y
        ábrela para imprimir.
      </p>

      <ReportSummary summary={report.summary} />

      <ReportControls eventId={id} shape={report.shape} />

      <div className="mt-8 rounded-xl border border-line bg-white p-8">
        <ReportSheet
          event={report.event}
          sections={report.sections}
          filterLabel={report.filterLabel}
          total={report.total}
          seats={report.seats}
          grouping={report.shape.grouping}
          fields={report.shape.fields}
        />
      </div>
    </div>
  );
}
