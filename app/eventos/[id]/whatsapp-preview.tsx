"use client";

import { useState } from "react";
import { renderTemplate, type TemplateName } from "@/lib/whatsapp/templates";
import { confirmationReply, declineReply } from "@/lib/whatsapp/replies";

/**
 * The conversation as a guest will actually see it.
 *
 * Every word here comes from the same place the real message does — the
 * approved template through `renderTemplate`, the replies through
 * `lib/whatsapp/replies`. Nothing is retyped, so this cannot drift into showing
 * something we do not send.
 */

type Answer = "solo" | "plus_one" | "no";

export function WhatsAppPreview({
  eventName,
  eventVars,
  guestName,
  hasCompanionVersion,
  cardSrc,
}: {
  eventName: string;
  /** The four event-level template values, in Meta's order. */
  eventVars: string[];
  guestName: string;
  hasCompanionVersion: boolean;
  cardSrc: string | null;
}) {
  const [companion, setCompanion] = useState(hasCompanionVersion);
  const [answer, setAnswer] = useState<Answer>("solo");

  // An event whose guests all have one seat has no companion version to show.
  const showingCompanion = hasCompanionVersion && companion;
  const template: TemplateName = showingCompanion
    ? "invitacion_evento_acompanante"
    : "invitacion_evento";

  const invitation = renderTemplate(template, [guestName, ...eventVars]);

  const facts = {
    name: guestName,
    eventName,
    when: eventVars[2] ?? "",
    where: eventVars[3] ?? "",
  };

  // The plain invitation has no "solo" button — its yes is just yes.
  const effective: Answer = showingCompanion ? answer : answer === "no" ? "no" : "solo";
  const tapped = showingCompanion
    ? { solo: "Asistiré solo", plus_one: "Con +1", no: "No asistiré" }[effective]
    : effective === "no"
      ? "No podré"
      : "Sí, asistiré";

  const reply =
    effective === "no"
      ? declineReply(facts)
      : confirmationReply(facts, effective === "plus_one");

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Cómo se ve en WhatsApp</h2>
        {hasCompanionVersion && (
          <div className="flex gap-2">
            {[
              { value: false, label: "Sin acompañante" },
              { value: true, label: "Con acompañante" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setCompanion(option.value)}
                className={`rounded-full border px-3 py-1 text-[0.8rem] transition-colors ${
                  companion === option.value
                    ? "border-accent bg-accent text-paper"
                    : "border-line text-ink-soft hover:border-accent"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-2 text-[0.9rem] leading-relaxed text-ink-muted">
        Esto es exactamente lo que enviamos. Toca una respuesta para ver qué recibe
        después.
      </p>

      <div className="mt-5 space-y-2 rounded-2xl bg-[#e6ddd4] p-4">
        <Bubble from="them">
          {invitation.header && <p className="font-semibold">{invitation.header}</p>}
          <p className="mt-1 whitespace-pre-line">{invitation.body}</p>
          {invitation.footer && (
            <p className="mt-2 text-[0.78rem] text-ink-muted">{invitation.footer}</p>
          )}
          <div className="-mx-3 mt-3 border-t border-black/10">
            {invitation.buttons.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() =>
                  setAnswer(
                    showingCompanion
                      ? (["solo", "plus_one", "no"][index] as Answer)
                      : index === 1
                        ? "no"
                        : "solo",
                  )
                }
                className="block w-full border-b border-black/10 px-3 py-2 text-center text-[0.85rem] text-[#00a5f4] last:border-0 hover:bg-black/5"
              >
                {label}
              </button>
            ))}
          </div>
        </Bubble>

        <Bubble from="me">{tapped}</Bubble>

        <Bubble from="them">
          <p className="whitespace-pre-line">{reply}</p>
        </Bubble>

        {effective !== "no" &&
          (cardSrc ? (
            <Bubble from="them">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cardSrc} alt="Invitación" className="w-full rounded-lg" />
            </Bubble>
          ) : (
            <p className="px-2 pt-1 text-[0.8rem] text-ink-muted">
              Aquí iría tu invitación. Súbela arriba y se envía junto con esta
              confirmación.
            </p>
          ))}
      </div>

      <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-muted">
        Quien escriba con sus propias palabras en vez de tocar un botón todavía no
        recibe respuesta automática.
      </p>
    </section>
  );
}

function Bubble({ from, children }: { from: "me" | "them"; children: React.ReactNode }) {
  const mine = from === "me";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[22rem] rounded-lg px-3 py-2 text-[0.88rem] leading-relaxed text-[#111b21] shadow-sm ${
          mine ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
