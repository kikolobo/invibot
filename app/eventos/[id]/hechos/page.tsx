import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, eventFacts } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { questionsFor } from "@/lib/events/questions";
import { listOpenEscalations } from "@/lib/agent/escalations";
import { AnswerEscalation } from "./answer-escalation";

export const metadata = { title: "Lo que el asistente sabe" };

/**
 * Everything the assistant can say, and everything it was asked and could not.
 *
 * Its own page because answering an unanswered question is work an organizer
 * comes here to do, not something to notice while scrolling past the venue.
 */
export default async function Hechos({
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

  const pending = await listOpenEscalations(id);
  const archived = event.archivedAt !== null;
  const answerable = questionsFor(event.kind).filter((q) => q.feedsAgent).length;
  const publicFacts = facts.filter((f) => f.visibility === "public");
  const internalFacts = facts.filter((f) => f.visibility === "internal");

  return (
    <div>
      <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
        Lo que el asistente sabe
      </h1>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
        El asistente sólo contesta con lo que está aquí. Lo que no sepa, te lo pregunta
        a ti y lo aprende con tu respuesta.
      </p>

      {pending.length > 0 && (
        <section className="mt-8 rounded-xl border border-accent/30 bg-accent/5 p-5">
          <h2 className="font-display text-xl text-ink">
            {pending.length === 1
              ? "Una pregunta sin contestar"
              : `${pending.length} preguntas sin contestar`}
          </h2>
          <p className="mt-1 text-[0.85rem] leading-relaxed text-ink-muted">
            Un invitado preguntó esto y le dijimos que te lo consultábamos. Al contestar,
            le avisamos a quien preguntó y el asistente lo aprende para la próxima.
          </p>
          <ul className="mt-5 space-y-5">
            {pending.map((item) => (
              <AnswerEscalation
                key={item.id}
                eventId={event.id}
                escalationId={item.id}
                question={item.questionText}
                waiting={item.waitingGuestIds.length}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl text-ink">Respuestas</h2>
          {!archived && (
            <Link
              href={`/eventos/${event.id}/detalles`}
              className="text-[0.85rem] text-accent hover:underline"
            >
              Contestar más
            </Link>
          )}
        </div>
        <p className="mt-2 text-[0.9rem] text-ink-muted">
          {publicFacts.length} de {answerable} preguntas del cuestionario contestadas.
        </p>

        {publicFacts.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-line bg-paper-deep p-6 text-center text-ink-muted">
            Todavía no has contestado nada.
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
            <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-muted">
              Esto no se lo decimos a nadie. El asistente no lo lee.
            </p>
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
    </div>
  );
}
