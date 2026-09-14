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

  return (
    <form action={action} className="mt-10 space-y-12">
      {sectionOrder.map((sectionId) => {
        const qs = visible.filter((q) => q.section === sectionId);
        if (!qs.length) return null;
        return (
          <section key={sectionId}>
            <h2 className="font-display text-2xl text-ink">{sections[sectionId].es}</h2>
            <div className="mt-6 space-y-7">
              {qs.map((q) => (
                <QuestionField key={q.key} q={q} answers={answers} onChange={onChange} />
              ))}
            </div>
          </section>
        );
      })}

      {state.error && <p className="text-[0.9rem] text-accent">{state.error}</p>}

      <div className="flex items-center gap-4 border-t border-line pt-8">
        <SubmitButton>Guardar</SubmitButton>
        <p className="text-[0.85rem] text-ink-muted">
          Puedes dejar preguntas en blanco. Si un invitado pregunta algo que no
          contestaste, el asistente te lo preguntará a ti.
        </p>
      </div>
    </form>
  );
}
