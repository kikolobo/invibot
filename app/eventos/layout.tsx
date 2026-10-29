import Link from "next/link";
import { getSession, requireOrg } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/permissions";
import { stopImpersonating } from "@/lib/admin/actions";
import { SignOutButton } from "./sign-out-button";

/**
 * Every organizer page sits under this layout, so `requireOrg()` here is the
 * single gate: unauthenticated visitors are redirected to /entrar before any
 * child page runs a query.
 */
export default async function EventosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email, name } = await requireOrg();
  const session = await getSession();
  const impersonating = Boolean(session?.session.impersonatedBy);
  const staff = !impersonating && isStaff(session?.user.role);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      {impersonating && (
        // Impossible to miss on purpose: everything done from here is done as
        // the customer, guests' WhatsApp included.
        <form
          action={stopImpersonating}
          className="print-hide flex flex-wrap items-center justify-center gap-3 bg-danger px-6 py-2 text-[0.88rem] text-paper"
        >
          <span>Estás viendo Invibot como {name || email}. Lo que hagas aquí lo hace esta cuenta.</span>
          <button type="submit" className="rounded-full border border-paper/60 px-3 py-0.5 hover:bg-paper/10">
            Volver al admin
          </button>
        </form>
      )}
      <header className="print-hide flex items-center justify-between gap-4 border-b border-line px-6 py-4 sm:px-10">
        <Link
          href="/eventos"
          className="font-display text-2xl tracking-tight text-ink transition-colors hover:text-accent"
        >
          Invibot
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {staff && (
            <Link href="/admin" className="text-ink-muted transition-colors hover:text-accent">
              Admin
            </Link>
          )}
          <Link
            href="/eventos/cuenta"
            className="hidden text-ink-muted transition-colors hover:text-accent sm:inline"
          >
            {name || email}
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
