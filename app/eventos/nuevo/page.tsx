import { SiteShell } from "@/components/site-chrome";
import { NuevoForm } from "./nuevo-form";

export const metadata = { title: "Nuevo evento" };

export default function NuevoEvento() {
  return (
    <SiteShell tone="paper">
      <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
        <p className="eyebrow">Paso 1 de 2</p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
          Cuéntanos de tu evento
        </h1>
        <p className="mt-4 leading-relaxed text-ink-soft">
          Lo básico primero. Después te haremos las preguntas que tus invitados
          suelen hacer, para que el asistente sepa contestarlas.
        </p>
        <NuevoForm />
      </div>
    </SiteShell>
  );
}
