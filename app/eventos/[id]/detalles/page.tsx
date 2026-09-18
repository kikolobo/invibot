import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, organizers } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { detailsToAnswers } from "@/lib/events/facts";
import { eventKindLabels } from "@/lib/events/kinds";
import { DetallesForm } from "./detalles-form";
import { Organizadores } from "./organizadores";

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
  // Nothing on this page is readable-only: it is the questionnaire form itself,
  // so an archived event goes back to the overview, where its answers are shown.
  if (event.archivedAt) redirect(`/eventos/${event.id}`);

  const team = await db
    .select({
      id: organizers.id,
      fullName: organizers.fullName,
      phoneE164: organizers.phoneE164,
      isResponder: organizers.isResponder,
    })
    .from(organizers)
    .where(eq(organizers.eventId, event.id))
    .orderBy(asc(organizers.createdAt));

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

        {/* Above the questionnaire, not below it. The questionnaire is long and
            answered over days; the team is short and set once, and at the
            bottom of a page like that it may as well not exist. */}
        <Organizadores eventId={event.id} rows={team} staffCode={event.staffCode} />

        <DetallesForm
          eventId={event.id}
          kind={event.kind}
          initialAnswers={detailsToAnswers(event.kind, event.details)}
        />
      </div>
    </>
  );
}
