import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { detailsToAnswers } from "@/lib/events/facts";
import { eventKindLabels } from "@/lib/events/kinds";
import { SiteShell } from "@/components/site-chrome";
import { DetallesForm } from "./detalles-form";

export const metadata = { title: "Detalles del evento" };

export default async function Detalles({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireOrg();

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.orgId, orgId)),
  });
  if (!event) notFound();

  return (
    <SiteShell tone="paper">
      <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
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
    </SiteShell>
  );
}
