import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { db } from "@/db";
import { events, eventFacts } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { eventKindLabels } from "@/lib/events/kinds";
import { questionsFor } from "@/lib/events/questions";
import { SiteShell } from "@/components/site-chrome";

export const metadata = { title: "Evento" };

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" });

export default async function EventoPage({
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

  const facts = await db
    .select()
    .from(eventFacts)
    .where(and(eq(eventFacts.eventId, id), eq(eventFacts.isActive, true)))
    .orderBy(asc(eventFacts.createdAt));

  // Render the date in the event's own timezone, not the server's.
  const local = new TZDate(event.startsAt, event.timezone);
  const answerable = questionsFor(event.kind).filter((q) => q.feedsAgent).length;
  const publicFacts = facts.filter((f) => f.visibility === "public");
  const internalFacts = facts.filter((f) => f.visibility === "internal");

  return (
    <SiteShell tone="paper">
      <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
        <p className="eyebrow">{eventKindLabels[event.kind].es}</p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
          {event.name}
        </h1>
        {event.hostNames && (
          <p className="mt-2 text-lg text-ink-soft">Invita: {event.hostNames}</p>
        )}

        <dl className="mt-8 grid gap-x-8 gap-y-4 border-y border-line py-6 sm:grid-cols-2">
          <div>
            <dt className="eyebrow">Cuándo</dt>
            <dd className="mt-1 text-ink first-letter:uppercase">
              {dateFmt.format(local)}
              <span className="text-ink-soft"> · {timeFmt.format(local)}</span>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Dónde</dt>
            <dd className="mt-1 text-ink">
              {event.venueName ?? "Sin definir"}
              {event.venueCity && (
                <span className="block text-[0.9rem] text-ink-soft">{event.venueCity}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Confirmación</dt>
            <dd className="mt-1 text-ink">
              {event.rsvpRequired ? "Requerida" : "No se pide"}
              {event.allowPlusOnes && (
                <span className="text-ink-soft">
                  {" "}
                  · hasta {event.maxPartySize} personas
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Estado</dt>
            <dd className="mt-1 text-ink">Borrador</dd>
          </div>
        </dl>

        <section className="mt-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl text-ink">
              Lo que el asistente ya sabe
            </h2>
            <Link
              href={`/eventos/${event.id}/detalles`}
              className="text-[0.85rem] text-accent hover:underline"
            >
              Editar
            </Link>
          </div>
          <p className="mt-2 text-[0.9rem] text-ink-muted">
            {publicFacts.length} de {answerable} preguntas contestadas. Las que
            falten, el asistente te las preguntará cuando un invitado las haga.
          </p>

          {publicFacts.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-line bg-paper-deep p-6 text-center text-ink-muted">
              Todavía no has contestado nada.{" "}
              <Link href={`/eventos/${event.id}/detalles`} className="text-accent hover:underline">
                Empieza aquí
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-6 space-y-4">
              {publicFacts.map((fact) => (
                <li key={fact.id} className="border-t border-line pt-4">
                  <p className="text-[0.9rem] text-ink-muted">{fact.question}</p>
                  <p className="mt-1 text-ink">{fact.answer}</p>
                </li>
              ))}
            </ul>
          )}

          {internalFacts.length > 0 && (
            <div className="mt-10 rounded-xl border border-line bg-paper-deep p-5">
              <p className="eyebrow">Sólo para ti</p>
              <ul className="mt-3 space-y-2">
                {internalFacts.map((fact) => (
                  <li key={fact.id} className="text-[0.9rem] text-ink-soft">
                    {fact.answer}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="mt-12 rounded-xl border border-line bg-paper-deep p-6">
          <p className="font-display text-xl text-ink">Siguiente paso</p>
          <p className="mt-2 leading-relaxed text-ink-soft">
            Elegir el diseño de la invitación y cargar tu lista de invitados.
            Todavía no está listo.
          </p>
        </div>
      </div>
    </SiteShell>
  );
}
