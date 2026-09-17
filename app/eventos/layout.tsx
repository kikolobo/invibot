import Link from "next/link";
import { requireOrg } from "@/lib/auth/session";
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

  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      <header className="print-hide flex items-center justify-between gap-4 border-b border-line px-6 py-4 sm:px-10">
        <Link
          href="/eventos"
          className="font-display text-2xl tracking-tight text-ink transition-colors hover:text-accent"
        >
          Invibot
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden text-ink-muted sm:inline">{name || email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
