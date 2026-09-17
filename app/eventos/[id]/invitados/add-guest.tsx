"use client";

import { useActionState, useEffect, useRef } from "react";
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
            Pases
            <Input
              name="partySizeAllowed"
              type="number"
              min={1}
              max={maxPartySize}
              defaultValue={1}
              className="max-w-20"
            />
          </label>
        )}
      </div>

      {state.error && <p className="mt-3 text-[0.88rem] text-accent">{state.error}</p>}
      {state.ok && <p className="mt-3 text-[0.88rem] text-ink-soft">{state.ok}</p>}

      <div className="mt-4">
        <SubmitButton>{pending ? "Agregando…" : "Agregar"}</SubmitButton>
      </div>
    </form>
  );
}
