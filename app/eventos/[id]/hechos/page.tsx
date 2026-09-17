import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, eventFacts } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { questionsFor } from "@/lib/events/questions";
import { detailsToAnswers } from "@/lib/events/facts";
import { listOpenEscalations } from "@/lib/agent/escalations";
import { AnswerEscalation } from "./answer-escalation";
import { EditAnswer, type EditableQuestion } from "./edit-answer";

export const metadata = { title: "Preguntas" };

/**
 * Everything the assistant can answer, in the two shapes it comes in.
 *
 * What the organizer filled in themselves, and what a guest thought to ask that
 * nobody had. The second list is the one that grows, and it is the reason this
 * page exists rather than being a read-only summary on the overview.
 */
export default async function Preguntas({
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

  // Catalogue answers keep their `key`; learned ones have none.
  const fromCatalog = facts.filter((f) => f.key !== null);
  const fromGuests = facts.filter((f) => f.key === null);

  const questions = questionsFor(event.kind);
  const answerable = questions.filter((q) => q.feedsAgent).length;
  const answers = detailsToAnswers(event.kind, event.details);

  /** The control the questionnaire would use, so an edit can be stored back. */
  const controlFor = (key: string | null): EditableQuestion | undefined => {
    const question = questions.find((q) => q.key === key);
    if (!question) return undefined;
    const raw = answers[question.key];
    return {
      type: question.type,
      options: question.options?.map((o) => ({ value: o.value, label: o.es })),
      value:
        question.type === "boolean"
          ? raw === true
            ? "si"
            : raw === false
              ? "no"
              : undefined
          : raw === undefined || raw === null
            ? undefined
            : String(raw),
    };
  };

  return (
    <div>
      <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">Preguntas</h1>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
        El asistente sólo contesta con lo que está aquí. Lo que no sepa, te lo pregunta a
        ti y lo aprende con tu respuesta.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-2xl text-ink">Preguntas de invitados</h2>
        <p className="mt-2 max-w-prose text-[0.9rem] leading-relaxed text-ink-muted">
          Lo que preguntaron y no estaba contestado. Al responder, le avisamos a quien
          preguntó y el asistente lo aprende para la próxima.
        </p>

        {pending.length > 0 && (
          <ul className="mt-5 space-y-5 rounded-xl border border-accent/30 bg-accent/5 p-5">
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
        )}

        {fromGuests.length > 0 ? (
          <ul className="mt-6 space-y-4">
            {fromGuests.map((fact) => (
              <EditAnswer
                key={fact.id}
                eventId={event.id}
                factId={fact.id}
                question={fact.question}
                answer={fact.answer}
              />
            ))}
          </ul>
        ) : (
          pending.length === 0 && (
            <p className="mt-6 rounded-xl border border-dashed border-line bg-paper-deep p-6 text-center text-ink-muted">
              Todavía nadie ha preguntado nada que no supiéramos contestar.
            </p>
          )
        )}
      </section>

      <section className="mt-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl text-ink">Detalles del evento</h2>
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
          {fromCatalog.filter((f) => f.visibility === "public").length} de {answerable}{" "}
          contestadas. Si cambias una aquí, también cambia en los detalles.
        </p>

        {fromCatalog.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-line bg-paper-deep p-6 text-center text-ink-muted">
            Todavía no has contestado nada.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {fromCatalog
              .filter((f) => f.visibility === "public")
              .map((fact) => (
                <EditAnswer
                  key={fact.id}
                  eventId={event.id}
                  questionKey={fact.key ?? undefined}
                  question={fact.question}
                  answer={fact.answer}
                  control={controlFor(fact.key)}
                />
              ))}
          </ul>
        )}

        {fromCatalog.some((f) => f.visibility === "internal") && (
          <div className="mt-10 rounded-xl border border-line bg-paper-deep p-5">
            <p className="eyebrow">Sólo para ti</p>
            <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-muted">
              Esto no se lo decimos a nadie. El asistente no lo lee.
            </p>
            <ul className="mt-3 space-y-2">
              {fromCatalog
                .filter((f) => f.visibility === "internal")
                .map((fact) => (
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
