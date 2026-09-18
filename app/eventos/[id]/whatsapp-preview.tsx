"use client";

import { useState } from "react";
import { renderTemplate, type TemplateName } from "@/lib/whatsapp/templates";
import { confirmationReply, declineReply } from "@/lib/whatsapp/replies";
import { Bubble, Phone } from "./chat-bubble";

/**
 * The conversation as a guest will actually see it.
 *
 * Every word comes from the same place the real message does — the approved
 * template through `renderTemplate`, the replies through `lib/whatsapp/replies`.
 * Nothing is retyped, so this cannot drift into showing something we do not
 * send, which is the only property that makes a preview worth having.
 *
 * It shows *this* event's invitation and no other. There was a toggle between
 * the plain and companion versions; it let an organizer study a configuration
 * they had not chosen, which is a question nobody was asking.
 */

type Answer = "solo" | "plus_one" | "no";

export function WhatsAppPreview({
  eventName,
  eventVars,
  guestName,
  withCompanion,
  cardSrc,
  where,
  mapsUrl,
  assistant,
}: {
  eventName: string;
  /** The four event-level template values, in Meta's order. */
  eventVars: string[];
  guestName: string;
  /** The place on its own — the template variable has the link glued on. */
  where: string;
  mapsUrl: string | null;
  /** Follows the event's own setting — never a choice made here. */
  withCompanion: boolean;
  cardSrc: string | null;
  /**
   * Handed down from the server. Reading it here would read nothing: this
   * component runs in the browser, where `process.env` is empty, and the
   * preview would show the default name while WhatsApp sent the configured one.
   */
  assistant: string;
}) {
  const [answer, setAnswer] = useState<Answer>("solo");

  const template: TemplateName = withCompanion
    ? "invitacion_evento_acompanante"
    : "invitacion_evento";
  const invitation = renderTemplate(template, [guestName, ...eventVars]);

  const facts = {
    name: guestName,
    eventName,
    when: eventVars[2] ?? "",
    where,
    mapsUrl,
    assistant,
  };

  // The plain invitation has no "solo" button — its yes is simply yes.
  const effective: Answer = withCompanion ? answer : answer === "no" ? "no" : "solo";
  const tapped = withCompanion
    ? { solo: "Asistiré solo", plus_one: "Con +1", no: "No asistiré" }[effective]
    : effective === "no"
      ? "No podré"
      : "Sí, asistiré";

  const reply =
    effective === "no"
      ? declineReply(facts)
      : confirmationReply(facts, effective === "plus_one");

  const answerFor = (index: number): Answer =>
    withCompanion ? (["solo", "plus_one", "no"][index] as Answer) : index === 1 ? "no" : "solo";

  return (
    <div>
      <Phone title={eventName}>
          <Bubble from="them">
            {invitation.header && <p className="font-semibold">{invitation.header}</p>}
            <p className="mt-1 whitespace-pre-line">{invitation.body}</p>
            {invitation.footer && (
              <p className="mt-2 text-[0.72rem] text-black/45">{invitation.footer}</p>
            )}
            <div className="-mx-2.5 -mb-1 mt-2 border-t border-black/10">
              {invitation.buttons.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setAnswer(answerFor(index))}
                  className={`block w-full border-b border-black/10 px-2 py-1.5 text-center text-[0.8rem] transition-colors last:border-0 hover:bg-black/5 ${
                    answerFor(index) === effective ? "font-medium text-[#0084ff]" : "text-[#00a5f4]"
                  }`}
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
              <Bubble from="them" padded={false}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cardSrc} alt="Invitación" className="w-full rounded-md" />
              </Bubble>
            ) : (
              <p className="px-1 pt-0.5 text-[0.72rem] leading-relaxed text-black/45">
                Aquí iría tu invitación. Súbela arriba y se envía junto con esta
                confirmación.
              </p>
            ))}
      </Phone>

      <p className="mt-4 max-w-prose text-[0.85rem] leading-relaxed text-ink-muted">
        Quien escriba con sus propias palabras en vez de tocar un botón todavía no
        recibe respuesta automática.
      </p>
    </div>
  );
}
