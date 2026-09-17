"use client";

import { useState, useTransition } from "react";
import { sendInvitations, type InviteReport } from "@/lib/campaigns/actions";
import { skipLabels, missingLabels, type SkipReason, type MissingField } from "@/lib/campaigns/labels";
import { renderTemplate, type TemplateName } from "@/lib/whatsapp/templates";
import { Bubble, Phone } from "../chat-bubble";

/**
 * The confirmation step before the only paid thing this app does.
 *
 * Every invitation is a MARKETING-category message billed per send, and it
 * cannot be recalled once a phone has it. So this shows the exact text, the
 * exact count, and exactly who is being left out and why — before the button
 * that spends the money is reachable.
 */

export type InvitePanelProps = {
  eventId: string;
  eventName: string;
  /** The four event-level template values, shared by every recipient. */
  eventVars: string[];
  missing: MissingField[];
  /** Guests who can receive it right now, by id, with the name the message uses. */
  /** The name the message uses, and which invitation they get. */
  eligible: Record<string, { greeting: string; template: TemplateName }>;
  skipped: Record<string, SkipReason>;
  selected: { id: string; fullName: string }[];
  onClose: () => void;
};

export function SendInvitations({
  eventId,
  eventName,
  eventVars,
  missing,
  eligible,
  skipped,
  selected,
  onClose,
}: InvitePanelProps) {
  const [report, setReport] = useState<InviteReport | null>(null);
  const [pending, startTransition] = useTransition();

  const recipients = selected.filter((guest) => guest.id in eligible);
  const omitted = selected.filter((guest) => guest.id in skipped);

  // Rendered from the same definition that was approved by Meta and that the
  // send will use, with the first real recipient's name in it.
  const first = recipients[0] ? eligible[recipients[0].id] : null;
  const preview =
    first && missing.length === 0
      ? renderTemplate(first.template, [first.greeting, ...eventVars])
      : null;

  // Two templates can be in one batch — the plus-one guests get a different
  // message, and previewing only the first would hide that.
  const plusOnes = recipients.filter(
    (guest) => eligible[guest.id]?.template === "invitacion_evento_acompanante",
  ).length;

  function confirm() {
    startTransition(async () => {
      setReport(await sendInvitations(eventId, recipients.map((guest) => guest.id)));
    });
  }

  if (report && !report.error) {
    const failures = report.outcomes?.filter((outcome) => !outcome.ok) ?? [];
    return (
      <div className="mt-3 rounded-xl border border-line bg-white p-5">
        <p className="font-display text-xl text-ink">
          {report.sent === 1 ? "Invitación enviada" : `${report.sent} invitaciones enviadas`}
        </p>
        {failures.length > 0 && (
          <div className="mt-4">
            <p className="eyebrow">No se pudieron enviar</p>
            <ul className="mt-2 space-y-1 text-[0.9rem] text-ink-soft">
              {failures.map((outcome) => (
                <li key={outcome.guestId}>
                  <span className="text-ink">{outcome.name}</span> — {outcome.detail}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[0.85rem] text-ink-muted">
              Puedes volver a seleccionarlos e intentar de nuevo; no se les cobra dos veces
              porque no se envió nada.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 rounded-full bg-accent px-5 py-2 text-[0.9rem] text-paper"
        >
          Listo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-white p-5">
      {missing.length > 0 ? (
        <p className="text-[0.95rem] leading-relaxed text-ink">
          Antes de invitar falta llenar{" "}
          <span className="text-accent">
            {missing.map((field) => missingLabels[field]).join(" y ")}
          </span>{" "}
          en los detalles del evento. La invitación los menciona, así que no podemos
          enviarla a medias.
        </p>
      ) : (
        <>
          <p className="font-display text-xl text-ink">
            {recipients.length === 1
              ? `Invitar a ${recipients[0].fullName}`
              : `Invitar a ${recipients.length} personas`}
          </p>
          <p className="mt-1 text-[0.85rem] leading-relaxed text-ink-muted">
            {recipients.length === 1
              ? "Se envía por WhatsApp y no se puede cancelar una vez enviado."
              : "Apruebas el formato una vez y salen todas. Se envían por WhatsApp y no se pueden cancelar una vez enviadas."}
            {plusOnes > 0 &&
              ` ${plusOnes} ${plusOnes === 1 ? "recibe" : "reciben"} la versión con acompañante.`}
          </p>

          {preview && (
            <div className="mt-4">
              <p className="eyebrow">Así se va a ver</p>
              {/*
                The same phone as the simulator, from the same components. An
                organizer who checked the wording there should not have to
                decide whether this differently-shaped box is the same message.
              */}
              <div className="mt-2">
                <Phone title={eventName}>
                  <Bubble from="them">
                    {preview.header && <p className="font-semibold">{preview.header}</p>}
                    <p className="mt-1 whitespace-pre-line">{preview.body}</p>
                    {preview.footer && (
                      <p className="mt-2 text-[0.72rem] text-black/45">{preview.footer}</p>
                    )}
                    <div className="-mx-2.5 -mb-1 mt-2 border-t border-black/10">
                      {preview.buttons.map((label) => (
                        <span
                          key={label}
                          className="block border-b border-black/10 px-2 py-1.5 text-center text-[0.8rem] text-[#00a5f4] last:border-0"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </Bubble>
                </Phone>
              </div>
              {recipients.length > 1 && (
                <p className="mt-2 max-w-md text-[0.8rem] leading-relaxed text-ink-muted">
                  Cada quien lo recibe con su propio nombre. Aquí se ve el de{" "}
                  {eligible[recipients[0].id].greeting}.
                </p>
              )}
            </div>
          )}

          {omitted.length > 0 && (
            <div className="mt-4">
              <p className="eyebrow">No se les envía</p>
              <ul className="mt-2 space-y-1 text-[0.9rem] text-ink-soft">
                {omitted.map((guest) => (
                  <li key={guest.id}>
                    <span className="text-ink">{guest.fullName}</span> —{" "}
                    {skipLabels[skipped[guest.id]]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {report?.error && <p className="mt-4 text-[0.9rem] text-accent">{report.error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {missing.length === 0 && recipients.length > 0 && (
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="rounded-full bg-accent px-5 py-2 text-[0.9rem] text-paper transition-opacity disabled:opacity-50"
          >
            {pending
              ? "Enviando…"
              : recipients.length === 1
                ? "Enviar invitación"
                : `Enviar ${recipients.length} invitaciones`}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="text-[0.9rem] text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
