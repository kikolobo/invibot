"use client";

import { useState, useTransition } from "react";
import { simulateReply, type ChatTurn } from "@/lib/agent/simulate";
import { Bubble, Phone } from "./chat-bubble";

/**
 * The assistant, rehearsing against the organizer.
 *
 * Nothing here reaches a guest and nothing is written down. The actions the
 * assistant *would* take are printed under the thread instead of performed,
 * which is the only way to find out it confirms someone who said "no sé si
 * pueda" before it does that to a real person.
 */
export function AgentChat({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    const text = draft.trim();
    if (!text || pending) return;

    const next: ChatTurn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setDraft("");
    setError(null);

    start(async () => {
      const result = await simulateReply(eventId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.reply) setTurns([...next, { role: "assistant", text: result.reply }]);
      if (result.actions?.length) setActions((prev) => [...prev, ...result.actions!]);
    });
  }

  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl text-ink">Pruébalo tú</h2>
      <p className="mt-2 max-w-prose text-[0.9rem] leading-relaxed text-ink-muted">
        Escríbele como si fueras un invitado. Contesta con lo que contestaste en los
        detalles del evento y nada más; lo que no sepa, te lo va a preguntar a ti. Nada
        de esto se envía ni se guarda.
      </p>

      <div className="mt-5">
        <Phone title={eventName}>
          {turns.length === 0 && (
            <p className="px-1 py-6 text-center text-[0.78rem] text-black/45">
              Prueba con “¿puedo llevar a mi hijo?” o “ahí estaré”.
            </p>
          )}
          {turns.map((turn, index) => (
            <Bubble key={index} from={turn.role === "user" ? "me" : "them"}>
              <p className="whitespace-pre-line">{turn.text}</p>
            </Bubble>
          ))}
          {pending && (
            <Bubble from="them">
              <p className="text-black/45">Escribiendo…</p>
            </Bubble>
          )}
        </Phone>
      </div>

      <div className="mt-3 flex max-w-[22rem] gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Escribe como invitado…"
          disabled={pending}
          className="w-full rounded-full border border-line bg-paper-deep px-4 py-2 text-[0.88rem] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-accent disabled:opacity-50"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || draft.trim().length === 0}
          className="shrink-0 rounded-full bg-action px-4 py-2 text-[0.85rem] text-ink-onaction disabled:opacity-50"
        >
          Enviar
        </button>
      </div>

      {error && <p className="mt-3 max-w-prose text-[0.85rem] text-danger">{error}</p>}

      {actions.length > 0 && (
        <div className="mt-5 max-w-prose rounded-xl border border-line bg-paper-deep p-4">
          <p className="eyebrow">Lo que habría hecho</p>
          <ul className="mt-2 space-y-1 text-[0.85rem] text-ink-soft">
            {actions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ul>
          <p className="mt-3 text-[0.78rem] leading-relaxed text-ink-muted">
            En una conversación real esto sí cambiaría la lista de invitados.
          </p>
        </div>
      )}

      {turns.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setTurns([]);
            setActions([]);
            setError(null);
          }}
          className="mt-4 text-[0.82rem] text-ink-muted transition-colors hover:text-accent"
        >
          Empezar de nuevo
        </button>
      )}
    </section>
  );
}
