import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-chrome";
import { getSession } from "@/lib/auth/session";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Entrar" };

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Only a path on this site: an open redirect would let any link that sends
  // people here forward them anywhere after they sign in.
  const { next: requested } = await searchParams;
  const next = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/eventos";

  if (await getSession()) redirect(next);
  return (
    <SiteShell tone="paper">
      <div className="mx-auto max-w-md px-6 py-16 sm:px-10">
        <h1 className="font-display text-4xl leading-tight text-ink">Entrar</h1>
        <p className="mt-3 leading-relaxed text-ink-soft">
          Entra para administrar tus eventos y tu lista de invitados.
        </p>
        <AuthForm mode="signin" next={next} />
      </div>
    </SiteShell>
  );
}
