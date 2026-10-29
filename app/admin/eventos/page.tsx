import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { PAGE_SIZE } from "@/lib/admin/users";
import { eventStateLabels, eventStateOf, listEvents, type EventFilter } from "@/lib/admin/events";
import { formatDate } from "../format";
import { formatNumber, percent } from "../ui";

export const metadata = { title: "Eventos" };

const FILTERS: { value: EventFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "upcoming", label: "Próximos" },
  { value: "past", label: "Pasados" },
  { value: "archived", label: "Archivados" },
  { value: "suspended", label: "Suspendidos" },
];

const isFilter = (value: unknown): value is EventFilter =>
  FILTERS.some((filter) => filter.value === value);

export default async function Eventos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; pagina?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const q = params.q ?? "";
  const filter = isFilter(params.estado) ? params.estado : "all";
  const page = Math.max(1, Number(params.pagina) || 1);

  const { rows, total } = await listEvents({ q, filter, page });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (next: { estado?: EventFilter; pagina?: number }) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    const estado = next.estado ?? filter;
    if (estado !== "all") query.set("estado", estado);
    if (next.pagina && next.pagina > 1) query.set("pagina", String(next.pagina));
    const text = query.toString();
    return `/admin/eventos${text ? `?${text}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Eventos</h1>
      <p className="mt-3 text-ink-soft">
        {total === 1 ? "Un evento" : `${formatNumber(total)} eventos`} · los próximos primero
      </p>

      <form className="mt-8 flex flex-wrap items-center gap-3" action="/admin/eventos">
        <input
          name="q"
          defaultValue={q}
          placeholder="Evento, o nombre o correo del dueño"
          className="w-full max-w-sm rounded-lg border border-line bg-paper px-3 py-2 text-ink"
        />
        {filter !== "all" && <input type="hidden" name="estado" value={filter} />}
        <button
          type="submit"
          className="rounded-full border border-line px-4 py-2 text-[0.88rem] text-ink-soft hover:border-accent hover:text-accent"
        >
          Buscar
        </button>
      </form>

      <nav className="mt-6 flex flex-wrap gap-2 text-[0.85rem]">
        {FILTERS.map((option) => (
          <Link
            key={option.value}
            href={href({ estado: option.value })}
            className={`rounded-full border px-3 py-1 ${
              option.value === filter ? "border-accent text-accent" : "border-line text-ink-soft hover:border-accent"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] text-left text-[0.9rem]">
          <thead className="bg-paper-deep text-[0.78rem] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-normal">Evento</th>
              <th className="px-4 py-3 font-normal">Dueño</th>
              <th className="px-4 py-3 font-normal">Fecha</th>
              <th className="px-4 py-3 font-normal">Estado</th>
              <th className="px-4 py-3 text-right font-normal">Invitados</th>
              <th className="px-4 py-3 text-right font-normal">Confirmados</th>
              <th className="px-4 py-3 text-right font-normal">Envíos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((event) => {
              const state = eventStateOf(event);
              return (
                <tr key={event.id} className="border-t border-line hover:bg-paper-deep/60">
                  <td className="px-4 py-3">
                    <Link href={`/admin/eventos/${event.id}`} className="text-ink hover:text-accent">
                      {event.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/usuarios/${event.ownerId}`} className="text-ink-soft hover:text-accent">
                      {event.ownerName || event.ownerEmail}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{formatDate(event.startsAt)}</td>
                  <td className={`px-4 py-3 ${state === "suspended" ? "text-danger" : "text-ink-soft"}`}>
                    {eventStateLabels[state]}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-soft">{formatNumber(event.guests)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                    {formatNumber(event.confirmed)}
                    <span className="block text-[0.78rem] text-ink-muted">{percent(event.confirmed, event.guests)}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-soft">{formatNumber(event.sends)}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                  Ningún evento coincide.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-[0.88rem] text-ink-soft">
          {page > 1 ? <Link href={href({ pagina: page - 1 })}>← Anterior</Link> : <span />}
          <span>
            Página {page} de {pages}
          </span>
          {page < pages ? <Link href={href({ pagina: page + 1 })}>Siguiente →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
