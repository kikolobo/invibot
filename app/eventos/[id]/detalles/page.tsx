import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/events/access";
import { detailsToAnswers } from "@/lib/events/facts";
import { eventKindLabels } from "@/lib/events/kinds";
import { DetallesForm } from "./detalles-form";

export const metadata = { title: "Detalles del evento" };

export default async function Detalles({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { event } = await requireEventAccess(id, "event");
  // Nothing on this page is readable-only: it is the questionnaire form itself,
  // so an archived event goes back to the overview, where its answers are shown.
  if (event.archivedAt) redirect(`/eventos/${event.id}`);

  return (
    <>
      <div>
        <p className="eyebrow">Paso 2 de 2 · {eventKindLabels[event.kind].es}</p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
          Lo que tus invitados van a preguntar
        </h1>
        <p className="mt-4 leading-relaxed text-ink-soft">
          Cada respuesta se vuelve algo que el asistente sabrá contestar por ti.
          No tienes que contestar todo de una vez.
        </p>

        <DetallesForm
          eventId={event.id}
          kind={event.kind}
          initialAnswers={detailsToAnswers(event.kind, event.details)}
        />
      </div>
    </>
  );
}
