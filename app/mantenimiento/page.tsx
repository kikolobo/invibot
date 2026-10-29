import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-chrome";
import { getSettings } from "@/lib/site/settings";

export const metadata = { title: "En mantenimiento" };

// Read on every visit: the switch is in the database, not in the build.
export const dynamic = "force-dynamic";

/**
 * Where organizers land while the site is shut. Once it is open again this
 * sends them back, so a bookmarked or refreshed tab does not stay stuck here.
 */
export default async function Mantenimiento() {
  const settings = await getSettings();
  if (!settings.maintenance) redirect("/eventos");

  return (
    <SiteShell tone="paper">
      <div className="mx-auto max-w-md px-6 py-20 sm:px-10">
        <h1 className="font-display text-4xl leading-tight text-ink">Volvemos en un rato</h1>
        <p className="mt-4 leading-relaxed text-ink-soft">
          {settings.maintenanceMessage?.trim() ||
            "Estamos haciendo mejoras en Invibot. Tus eventos siguen funcionando: tus invitados pueden confirmar y escribirle al asistente por WhatsApp como siempre."}
        </p>
        <Link href="/entrar" className="mt-8 inline-block text-[0.9rem] text-ink-muted hover:text-accent">
          Soy del equipo de Invibot
        </Link>
      </div>
    </SiteShell>
  );
}
