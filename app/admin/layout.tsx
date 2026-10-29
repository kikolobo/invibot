import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { roleLabels } from "@/lib/auth/permissions";
import { SignOutButton } from "@/app/eventos/sign-out-button";
import { getSettings } from "@/lib/site/settings";

export const metadata = { title: { template: "%s · Admin Invibot", default: "Admin Invibot" } };

/**
 * The console for the people who run Invibot. `requireStaff()` here 404s
 * anyone else before a child page runs — and every action checks again for
 * itself, because a layout is not what guards a server action.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email, name, role } = await requireStaff();
  const settings = await getSettings();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4 sm:px-10">
        <div className="flex items-center gap-6">
          <Link
            href="/admin"
            className="font-display text-2xl tracking-tight text-ink transition-colors hover:text-accent"
          >
            Invibot <span className="text-ink-muted">admin</span>
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
            <Link href="/admin" className="hover:text-accent">
              Dashboard
            </Link>
            <Link href="/admin/usuarios" className="hover:text-accent">
              Cuentas
            </Link>
            <Link href="/admin/eventos" className="hover:text-accent">
              Eventos
            </Link>
            <Link href="/admin/configuracion" className="hover:text-accent">
              Configuración
            </Link>
            <Link href="/admin/actividad" className="hover:text-accent">
              Actividad
            </Link>
            <Link href="/eventos" className="hover:text-accent">
              Mis eventos
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden text-ink-muted sm:inline">
            {name || email} · {roleLabels[role]}
          </span>
          <SignOutButton />
        </div>
      </header>
      {settings.maintenance && (
        <Link
          href="/admin/configuracion"
          className="block bg-danger px-6 py-2 text-center text-[0.88rem] text-paper"
        >
          El sitio está en mantenimiento: sólo el staff puede usar la app de organizadores.
        </Link>
      )}
      <main className="flex-1">{children}</main>
    </div>
  );
}
