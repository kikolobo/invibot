import Link from "next/link";
import { SiteShell } from "@/components/site-chrome";

export const metadata = { title: "Variantes de diseño" };

/**
 * Internal page for comparing landing page directions side by side. Delete once a
 * direction is chosen; it is not linked from anywhere public.
 */
const variants = [
  {
    href: "/",
    name: "Conversación",
    tag: "Actual",
    body: "Oscuro y cinematográfico. El hero es una conversación real en español y una segunda sección muestra el ciclo de escalación con el organizador. Demuestra el producto en vez de describirlo.",
  },
  {
    href: "/variantes/papel",
    name: "Papel",
    tag: "Alternativa",
    body: "Papel cálido, tipografía serif, editorial y tranquilo. Evoca la papelería de una invitación impresa. Explica el producto en cuatro pasos.",
  },
];

export default function Variantes() {
  return (
    <SiteShell tone="paper">
      <div className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
        <p className="eyebrow">Interno</p>
        <h1 className="mt-4 font-display text-4xl text-ink sm:text-5xl">
          Variantes de diseño
        </h1>
        <div className="mt-10 space-y-4">
          {variants.map((v) => (
            <Link
              key={v.href}
              href={v.href}
              className="block rounded-xl border border-line bg-paper-deep p-6 transition-colors hover:border-accent"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-2xl text-ink">{v.name}</h2>
                <span className="eyebrow">{v.tag}</span>
              </div>
              <p className="mt-2 leading-relaxed text-ink-soft">{v.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
