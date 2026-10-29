import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { listAudit } from "@/lib/admin/users";
import { auditLabels, type AuditAction } from "@/lib/admin/audit";
import { formatDateTime } from "../format";
import { describeDetail } from "@/lib/admin/describe";

export const metadata = { title: "Actividad" };

/** Everything staff did, newest first. A purged account stays here by email. */
export default async function Actividad({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  await requireStaff();
  const page = Math.max(1, Number((await searchParams).pagina) || 1);
  const entries = await listAudit({ page });

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 sm:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Actividad</h1>
      <p className="mt-3 text-ink-soft">Lo que el staff le ha hecho a las cuentas.</p>

      <ul className="mt-10 divide-y divide-line rounded-xl border border-line">
        {entries.map((entry) => (
          <li key={entry.id} className="px-4 py-3 text-[0.9rem]">
            <span className="text-ink">{auditLabels[entry.action as AuditAction] ?? entry.action}</span>
            {" · "}
            {entry.action === "promo_create" || entry.action === "promo_toggle" ? (
              <Link href="/admin/codigos" className="text-ink-soft hover:text-accent">
                {String(entry.detail?.code ?? "Código")}
              </Link>
            ) : entry.action === "settings" ? (
              <Link href="/admin/configuracion" className="text-ink-soft hover:text-accent">
                Sitio
              </Link>
            ) : entry.detail && typeof entry.detail.eventId === "string" ? (
              <Link href={`/admin/eventos/${entry.detail.eventId}`} className="text-ink-soft hover:text-accent">
                {String(entry.detail.eventName ?? "Evento")}
              </Link>
            ) : entry.action === "purge" || !entry.targetUserId ? (
              <span className="text-ink-soft">{entry.targetEmail}</span>
            ) : (
              <Link href={`/admin/usuarios/${entry.targetUserId}`} className="text-ink-soft hover:text-accent">
                {entry.targetEmail}
              </Link>
            )}
            {describeDetail(entry.detail) && (
              <span className="block text-[0.85rem] text-ink-soft">{describeDetail(entry.detail)}</span>
            )}
            <span className="block text-[0.82rem] text-ink-muted">
              {entry.actorName || entry.actorEmail || "script"} · {formatDateTime(entry.createdAt)}
            </span>
          </li>
        ))}
        {!entries.length && <li className="px-4 py-10 text-center text-ink-muted">Nada todavía.</li>}
      </ul>

      <nav className="mt-6 flex justify-between text-[0.88rem] text-ink-soft">
        {page > 1 ? <Link href={`/admin/actividad?pagina=${page - 1}`}>← Más recientes</Link> : <span />}
        {entries.length === 50 ? <Link href={`/admin/actividad?pagina=${page + 1}`}>Anteriores →</Link> : <span />}
      </nav>
    </div>
  );
}
