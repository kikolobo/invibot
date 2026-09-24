import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { eventFacts } from "@/db/schema";
import { can, requireEventAccess } from "@/lib/events/access";
import { listOpenEscalations, waitingGuestNames, askersOfFact } from "@/lib/agent/escalations";
import { AnswerEscalation } from "./answer-escalation";
import { EditAnswer } from "./edit-answer";

export const metadata = { title: "Preguntas" };

/**
 * What guests asked that nobody had written down.
 *
 * Only that. The questionnaire answers have their own page and editing them in
 * two places invites the two from disagreeing — this page is for the list that
 * grows on its own.
 */
export default async function Preguntas({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requireEventAccess(id, "answer");
  const { event } = access;
  const editsEvent = can(access, "event");

  // Learned facts have no `key`; the catalogue's do, and they live in Detalles.
  const answered = await db
    .select()
    .from(eventFacts)
    .where(and(eq(eventFacts.eventId, id), eq(eventFacts.isActive, true)))
    .orderBy(asc(eventFacts.createdAt))
    .then((rows) => rows.filter((fact) => fact.key === null));

  const pending = await listOpenEscalations(id);

  // Who asked, for both lists. An answered question keeps the link back to the
  // escalation it came from, so the names survive being answered.
  const answeredAskers = new Map(
    await Promise.all(
      answered.map(
        async (fact) =>
          [fact.id, await askersOfFact(fact.originEscalationId)] as const,
      ),
    ),
  );

  // Resolved here rather than in the component so the list can say who is
  // asking without a round trip per question.
  const askers = new Map(
    await Promise.all(
      pending.map(
        async (item) =>
          [item.id, await waitingGuestNames(item.waitingGuestIds)] as const,
      ),
    ),
  );
  const archived = event.archivedAt !== null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">Preguntas</h1>
        {!archived && editsEvent && (
          <Link
            href={`/eventos/${event.id}/detalles`}
            className="text-[0.85rem] text-accent hover:underline"
          >
            Editar detalles
          </Link>
        )}
      </div>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
        Lo que tus invitados preguntaron y el asistente no supo contestar. Al responder,
        le avisamos a quien preguntó y lo aprende para la próxima.
      </p>

      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl text-ink">
            Sin contestar
            <span className="ml-2 text-[0.9rem] font-normal text-ink-muted">
              {pending.length === 1 ? "1 pregunta" : `${pending.length} preguntas`}
            </span>
          </h2>
          <ul className="mt-4 space-y-5 rounded-xl border border-accent/30 bg-action/5 p-5">
            {pending.map((item) => (
              <AnswerEscalation
                key={item.id}
                eventId={event.id}
                escalationId={item.id}
                question={item.questionText}
                waiting={askers.get(item.id) ?? []}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        {answered.length > 0 && (
          <h2 className="font-display text-xl text-ink">Ya contestadas</h2>
        )}

        {answered.length > 0 ? (
          <ul className="mt-4 space-y-4">
            {answered.map((fact) => (
              <EditAnswer
                key={fact.id}
                eventId={event.id}
                factId={fact.id}
                question={fact.question}
                answer={fact.answer}
                askedBy={answeredAskers.get(fact.id) ?? []}
                editable={editsEvent}
              />
            ))}
          </ul>
        ) : (
          pending.length === 0 && (
            <p className="rounded-xl border border-dashed border-line bg-paper-deep p-6 text-center text-ink-muted">
              Todavía nadie ha preguntado algo que no supiéramos contestar. Lo que
              contestes en los detalles, el asistente ya lo sabe.
            </p>
          )
        )}
      </section>
    </div>
  );
}
