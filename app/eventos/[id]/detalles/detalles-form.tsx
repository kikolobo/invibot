"use client";

import { useActionState, useState } from "react";
import { saveDetails, type ActionState } from "@/lib/events/actions";
import type { EventKind } from "@/lib/events/kinds";
import {
  questionsFor,
  sections,
  sectionOrder,
  type Answers,
  type Question,
} from "@/lib/events/questions";
import { Field, Input, Select, Textarea, YesNo, SubmitButton } from "@/components/ui/field";

function QuestionField({
  q,
  answers,
  onChange,
}: {
  q: Question;
  answers: Answers;
  onChange: (key: string, value: unknown) => void;
}) {
  const value = answers[q.key];

  return (
    <Field label={q.es} help={q.help?.es} required={q.required}>
      {q.type === "boolean" && (
        <YesNo name={q.key} defaultValue={value as boolean | undefined} />
      )}

      {q.type === "select" && (
        <Select
          name={q.key}
          defaultValue={(value as string) ?? ""}
          placeholder="Elige una opción"
          options={(q.options ?? []).map((o) => ({ value: o.value, label: o.es }))}
          onChange={(e) => onChange(q.key, e.target.value)}
        />
      )}

      {q.type === "text" && (
        <Input
          name={q.key}
          defaultValue={(value as string) ?? ""}
          placeholder={q.placeholder?.es}
        />
      )}

      {q.type === "longtext" && (
        <Textarea
          name={q.key}
          defaultValue={(value as string) ?? ""}
          placeholder={q.placeholder?.es}
        />
      )}

      {q.type === "urls" && (
        <Textarea
          name={q.key}
          rows={2}
          defaultValue={Array.isArray(value) ? value.join("\n") : ""}
          placeholder="https://..."
        />
      )}
    </Field>
  );
}

export function DetallesForm({
  eventId,
  kind,
  initialAnswers,
}: {
  eventId: string;
  kind: EventKind;
  initialAnswers: Answers;
}) {
  // Conditional questions depend on answers as they are typed, so the catalog is
  // evaluated here rather than on the server. It is plain data plus predicates,
  // which is why it bundles cleanly to the client.
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const onChange = (key: string, value: unknown) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const save = saveDetails.bind(null, eventId);
  const [state, action] = useActionState<ActionState, FormData>(save, {});

  const all = questionsFor(kind);
  const visible = all.filter((q) => !q.appliesWhen || q.appliesWhen(answers));

  const filled = (q: { key: string }) => {
    const value = answers[q.key];
    return value !== undefined && value !== null && value !== "";
  };

  const tabs = sectionOrder
    .map((id) => {
      const qs = visible.filter((q) => q.section === id);
      return { id, qs, done: qs.filter(filled).length };
    })
    .filter((tab) => tab.qs.length > 0);

  const [active, setActive] = useState(tabs[0]?.id ?? sectionOrder[0]);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <form action={action} className="mt-10">
      {/* Each tab says how far along it is. The questionnaire is answered over
          days, and a tab that cannot show what is still blank hides exactly the
          thing an organizer came back to find. */}
      <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
        <div role="tablist" className="flex gap-1 border-b border-line">
          {tabs.map((tab) => {
            const selected = tab.id === current?.id;
            const complete = tab.done === tab.qs.length;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(tab.id)}
                className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-[0.9rem] transition-colors ${
                  selected
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-muted hover:text-ink-soft"
                }`}
              >
                {sections[tab.id].es}
                <span
                  className={`ml-2 text-[0.75rem] ${complete ? "text-ink-muted" : "text-accent"}`}
                >
                  {tab.done}/{tab.qs.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Every section stays mounted and the inactive ones are hidden with CSS.
          Unmounting would take their inputs out of the form, and `saveDetails`
          reads every question by key — a tab nobody opened would come back
          blank and wipe what was there. */}
      {tabs.map((tab) => (
        <section key={tab.id} hidden={tab.id !== current?.id} className="mt-8">
          <div className="space-y-7">
            {tab.qs.map((q) => (
              <QuestionField key={q.key} q={q} answers={answers} onChange={onChange} />
            ))}
          </div>
        </section>
      ))}

      {state.error && <p className="mt-6 text-[0.9rem] text-accent">{state.error}</p>}

      {/* One button for the whole questionnaire, not one per tab. Guardar saves
          every section, so moving between tabs loses nothing — but leaving the
          page without pressing it does, and that is worth saying where the
          button is. */}
      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-line pt-8">
        <SubmitButton>Guardar</SubmitButton>
        <p className="text-[0.85rem] text-ink-muted">
          Guarda todas las pestañas a la vez. Puedes dejar preguntas en blanco: si un
          invitado pregunta algo que no contestaste, el asistente te lo preguntará a ti.
        </p>
      </div>
    </form>
  );
}
