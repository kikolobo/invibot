import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/session";
import { loadReport, type ReportQuery } from "@/lib/reports/load";
import { ReportSheet } from "@/components/report-sheet";
import { AutoPrint } from "./auto-print";

export const metadata = { title: "Lista de invitados" };

/**
 * The sheet on its own.
 *
 * Outside `/eventos`, so it inherits none of the app's layout — there is no
 * header to hide and no menu to suppress, because neither is rendered. A page
 * with nothing on it prints better than a page taught to hide things.
 */
export default async function Imprimir({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ReportQuery>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { orgId } = await requireOrg();

  const report = await loadReport(id, orgId, query);
  if (!report) notFound();

  return (
    <div className="mx-auto max-w-3xl bg-white px-10 py-12 text-ink">
      <AutoPrint />
      <ReportSheet
        event={report.event}
        sections={report.sections}
        filterLabel={report.filterLabel}
        total={report.total}
        seats={report.seats}
        grouped={report.shape.grouped}
      />
    </div>
  );
}
