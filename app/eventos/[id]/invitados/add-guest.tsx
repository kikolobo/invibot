"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addGuest, type GuestActionState } from "@/lib/guests/actions";
import { Input, SubmitButton } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";

export function AddGuest({
  eventId,
  maxPartySize,
  groups,
}: {
  eventId: string;
  maxPartySize: number;
  groups: string[];
}) {
  const bound = addGuest.bind(null, eventId);
  const [state, action, pending] = useActionState<GuestActionState, FormData>(bound, {});
  const formRef = useRef<HTMLFormElement>(null);
  // Closed by default: most of the time this form is used to type a name and a
  // phone number forty times in a row, and every extra field in the way of that
  // is a field to tab past.
  const [more, setMore] = useState(false);

  // Clear the form after a successful add so the next name can be typed straight in.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="rounded-xl border border-line bg-paper-deep p-5">
      <p className="font-display text-xl text-ink">Agregar invitado</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input name="fullName" placeholder="Nombre completo" required />
        <Input name="phone" placeholder="55 1234 5678" inputMode="tel" />
        <Input name="email" type="email" placeholder="correo@ejemplo.com (opcional)" />
        <Combobox name="group" options={groups} placeholder="Grupo o relación" />
        {maxPartySize > 1 && (
          <label className="flex items-center gap-3 text-[0.9rem] text-ink-soft">
            <input
              type="checkbox"
              name="noCompanion"
              className="size-4 accent-[var(--accent)]"
            />
            No permitir acompañante
          </label>
        )}
        {maxPartySize > 1 && (
          <Input name="companionName" placeholder="Nombre de su pareja (opcional)" />
        )}
      </div>

      <button
        type="button"
        onClick={() => setMore((open) => !open)}
        aria-expanded={more}
        className="mt-3 inline-flex items-center gap-1.5 text-[0.85rem] text-ink-muted transition-colors hover:text-accent"
      >
        <svg
          viewBox="0 0 12 12"
          className={`size-3 transition-transform ${more ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M4.5 2.5 8 6l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Más
      </button>

      {more && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 text-[0.9rem] text-ink-soft">
            Mesa
            <Input
              name="tableNumber"
              inputMode="numeric"
              maxLength={5}
              pattern="[0-9]*"
              placeholder="—"
              className="max-w-24"
            />
          </label>
          <label className="flex items-center gap-3 text-[0.9rem] text-ink-soft">
            <input type="checkbox" name="isVip" className="size-4 accent-[var(--accent)]" />
            VIP
            <span className="text-[0.78rem] text-ink-muted">(sólo tú lo ves)</span>
          </label>
          <label className="text-[0.9rem] text-ink-soft sm:col-span-2">
            <span className="block">Notas</span>
            <Input name="notes" placeholder="Alergias, cómo llegó a la lista, lo que sea" />
            <span className="mt-1 block text-[0.78rem] text-ink-muted">
              Sólo para ti. El asistente nunca las lee ni las repite.
            </span>
          </label>
        </div>
      )}

      {state.error && <p className="mt-3 text-[0.88rem] text-danger">{state.error}</p>}
      {state.ok && <p className="mt-3 text-[0.88rem] text-ink-soft">{state.ok}</p>}

      <div className="mt-4">
        <SubmitButton>{pending ? "Agregando…" : "Agregar"}</SubmitButton>
      </div>
    </form>
  );
}
