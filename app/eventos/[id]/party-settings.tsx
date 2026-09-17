"use client";

import { useActionState, useState } from "react";
import { updatePartySettings, type ActionState } from "@/lib/events/actions";
import { MAX_PARTY_SIZE } from "@/lib/events/party";
import { Input } from "@/components/ui/field";

/**
 * Companions, editable after the fact.
 *
 * Kept on the event overview rather than in `detalles`, which is the intake
 * catalogue — what guests will ask — while this decides what the invitation
 * itself offers.
 */
export function PartySettings({
  eventId,
  allowPlusOnes: initialAllow,
  maxPartySize: initialMax,
  invitedCount,
}: {
  eventId: string;
  allowPlusOnes: boolean;
  maxPartySize: number;
  invitedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [allowPlusOnes, setAllowPlusOnes] = useState(initialAllow);
  const [state, formAction, pending] = useActionState<ActionState & { ok?: string }, FormData>(
    updatePartySettings.bind(null, eventId),
    {},
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center rounded-full border border-line px-3 py-1 text-[0.8rem] text-ink-soft transition-colors hover:border-accent hover:text-accent"
      >
        {initialAllow ? "Cambiar acompañantes" : "Permitir acompañantes"}
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 rounded-xl border border-line bg-white p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="allowPlusOnes"
          checked={allowPlusOnes}
          onChange={(e) => setAllowPlusOnes(e.target.checked)}
          className="mt-1 size-4 accent-[var(--accent)]"
        />
        <span>
          <span className="text-[0.95rem] font-medium text-ink">Permitir acompañantes</span>
          <span className="block text-[0.82rem] text-ink-muted">
            Cada invitación ofrece un lugar extra.
          </span>
        </span>
      </label>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-[0.9rem] text-ink-soft">Personas por invitación</span>
        {allowPlusOnes ? (
          <Input type="number" defaultValue={2} disabled className="max-w-20 opacity-60" />
        ) : (
          <Input
            type="number"
            name="maxPartySize"
            min={1}
            max={MAX_PARTY_SIZE}
            defaultValue={Math.min(initialMax, MAX_PARTY_SIZE)}
            className="max-w-20"
          />
        )}
      </div>

      {invitedCount > 0 && (
        <p className="mt-4 text-[0.82rem] leading-relaxed text-ink-muted">
          Ya enviaste {invitedCount} {invitedCount === 1 ? "invitación" : "invitaciones"}. Esto
          no cambia lo que esas personas ya recibieron, solo las que falten.
        </p>
      )}

      {state.error && <p className="mt-3 text-[0.88rem] text-accent">{state.error}</p>}
      {state.ok && <p className="mt-3 text-[0.88rem] text-ink-soft">{state.ok}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-[0.85rem] text-ink-muted hover:text-ink disabled:opacity-50"
        >
          Cerrar
        </button>
      </div>
    </form>
  );
}
