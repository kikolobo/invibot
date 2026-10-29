import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { isPlatformRole, roleLabels } from "@/lib/auth/permissions";
import { PAGE_SIZE, listUsers, statusLabels, statusOf, type UserFilter } from "@/lib/admin/users";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "../format";

export const metadata = { title: "Cuentas" };

const FILTERS: { value: UserFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "active", label: "Activas" },
  { value: "suspended", label: "Suspendidas" },
  { value: "deleted", label: "Eliminadas" },
  { value: "staff", label: "Staff" },
];

const isFilter = (value: unknown): value is UserFilter =>
  FILTERS.some((filter) => filter.value === value);

const statusTone = {
  active: "text-ink-soft",
  suspended: "text-danger",
  deleted: "text-ink-muted line-through",
};

export default async function Usuarios({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; pagina?: string }>;
}) {
  const { role } = await requireStaff();
  const params = await searchParams;
  const q = params.q ?? "";
  const filter = isFilter(params.estado) ? params.estado : "all";
  const page = Math.max(1, Number(params.pagina) || 1);

  const { rows, total } = await listUsers({ q, filter, page });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (next: { estado?: UserFilter; pagina?: number }) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    const estado = next.estado ?? filter;
    if (estado !== "all") query.set("estado", estado);
    if (next.pagina && next.pagina > 1) query.set("pagina", String(next.pagina));
    const text = query.toString();
    return `/admin/usuarios${text ? `?${text}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-ink sm:text-5xl">Cuentas</h1>
          <p className="mt-3 text-ink-soft">
            {total === 1 ? "Una cuenta" : `${total} cuentas`}
            {filter !== "all" && ` · ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}`}
          </p>
        </div>
        {role === "admin" && (
          <Link
            href="/admin/usuarios/nuevo"
            className="rounded-full bg-action px-5 py-2 text-[0.9rem] text-ink-onaction"
          >
            Nueva cuenta
          </Link>
        )}
      </div>

      <form className="mt-8 flex flex-wrap items-center gap-3" action="/admin/usuarios">
        <input
          name="q"
          defaultValue={q}
          placeholder="Nombre, correo o WhatsApp"
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
              option.value === filter
                ? "border-accent text-accent"
                : "border-line text-ink-soft hover:border-accent"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[720px] text-left text-[0.9rem]">
          <thead className="bg-paper-deep text-[0.78rem] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-normal">Cuenta</th>
              <th className="px-4 py-3 font-normal">WhatsApp</th>
              <th className="px-4 py-3 font-normal">Rol</th>
              <th className="px-4 py-3 font-normal">Estado</th>
              <th className="px-4 py-3 text-right font-normal">Eventos</th>
              <th className="px-4 py-3 font-normal">Alta</th>
              <th className="px-4 py-3 font-normal">Última vez</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => {
              const status = statusOf(user);
              return (
                <tr key={user.id} className="border-t border-line hover:bg-paper-deep/60">
                  <td className="px-4 py-3">
                    <Link href={`/admin/usuarios/${user.id}`} className="block hover:text-accent">
                      <span className="text-ink">{user.name || "Sin nombre"}</span>
                      <span className="block text-[0.82rem] text-ink-muted">{user.email}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {user.phone ? formatPhone(user.phone) : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {isPlatformRole(user.role) ? roleLabels[user.role] : user.role}
                  </td>
                  <td className={`px-4 py-3 ${statusTone[status]}`}>{statusLabels[status]}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                    {user.events}
                    {user.sharedEvents > 0 && (
                      <span className="block text-[0.78rem] text-ink-muted">
                        +{user.sharedEvents} {user.sharedEvents === 1 ? "compartido" : "compartidos"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3 text-ink-soft">{formatDate(user.lastSeen)}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                  Ninguna cuenta coincide.
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
