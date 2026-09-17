"use client";

import { useState, useTransition } from "react";
import { setAutoRegister } from "@/lib/events/actions";

/**
 * Auto-registro, from the host's side.
 *
 * Turning it on is immediate; turning it off asks first. Not because the switch
 * is dangerous — nobody is deleted — but because "desactivar" reads like it
 * might be, and a host with forty people waiting deserves to be told plainly
 * that they stay exactly where they are.
 */
export function AutoRegister({
  eventId,
  enabled,
  link,
  pendingCount,
}: {
  eventId: string;
  enabled: boolean;
  link: string | null;
  pendingCount: number;
}) {
  const [on, setOn] = useState(enabled);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const apply = (next: boolean) =>
    start(async () => {
      const result = await setAutoRegister(eventId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOn(next);
      setConfirmingOff(false);
    });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied often enough — over plain http, in some
      // in-app browsers — that failing silently would look like a dead button.
      setError("No pudimos copiar la liga. Selecciónala y cópiala a mano.");
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-line bg-paper-deep p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-lg text-ink">Autorregistro con liga de WhatsApp</p>
          <p className="mt-1 text-[0.88rem] leading-relaxed text-ink-muted">
            Comparte una liga en tus grupos y quien la abre se registra solo. Nadie recibe
            invitación ni puede confirmar hasta que tú lo apruebes.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Habilitar autorregistro con liga de WhatsApp"
          disabled={pending}
          onClick={() => (on ? setConfirmingOff(true) : apply(true))}
          className={`mt-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            on ? "bg-accent" : "bg-line"
          }`}
        >
          <span
            className={`block size-5 rounded-full bg-paper transition-transform ${
              on ? "translate-x-[22px]" : "translate-x-[2px]"
            }`}
          />
        </button>
      </div>

      {confirmingOff && (
        <div className="mt-4 rounded-lg border border-line bg-paper p-4">
          <p className="text-[0.88rem] leading-relaxed text-ink">
            Personas registradas seguirán en el estado previo a deshabilitar esta opción.
            No son eliminados de la lista automáticamente.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => apply(false)}
              disabled={pending}
              className="rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
            >
              {pending ? "Desactivando…" : "Desactivar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingOff(false)}
              className="rounded-full border border-line px-5 py-2 text-[0.85rem] text-ink-soft"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {on && link && !confirmingOff && (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-line bg-paper px-3 py-2 text-[0.82rem] text-ink-soft">
              {link}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-full border border-line px-4 py-2 text-[0.82rem] text-ink-soft transition-colors hover:border-accent hover:text-accent"
            >
              {copied ? "Copiada" : "Copiar"}
            </button>
          </div>
          <p className="mt-2 text-[0.8rem] text-ink-muted">
            Al abrirla, WhatsApp escribe el mensaje solo. El invitado únicamente agrega su
            nombre.
          </p>
        </div>
      )}

      {on && pendingCount > 0 && !confirmingOff && (
        <p className="mt-3 text-[0.88rem] text-ink">
          {pendingCount === 1
            ? "1 persona espera tu aprobación."
            : `${pendingCount} personas esperan tu aprobación.`}
        </p>
      )}

      {error && <p className="mt-3 text-[0.88rem] text-accent">{error}</p>}
    </div>
  );
}
