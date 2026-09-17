"use client";

import { useActionState, useState } from "react";
import { updateEventBasics, type ActionState } from "@/lib/events/actions";
import { Field, Input, SubmitButton } from "@/components/ui/field";

/**
 * The things the invitation actually says: who invites, when, where, and
 * whether an answer is expected.
 *
 * Venues move and dates shift, and until now correcting either meant starting
 * the event over. The assistant reads these straight off the event, so a
 * change here changes what it tells guests from the next message on — but it
 * cannot reach invitations already sent, which is what the warning is for.
 */
export function EditBasics({
  eventId,
  hostNames,
  date,
  time,
  venueName,
  venueAddress,
  venueCity,
  rsvpRequired,
  invitedCount,
}: {
  eventId: string;
  hostNames: string | null;
  /** Already rendered in the event's own timezone by the server. */
  date: string;
  time: string;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  rsvpRequired: boolean;
  invitedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState & { ok?: string }, FormData>(
    async (prev: ActionState, formData: FormData) => {
      const result = await updateEventBasics(eventId, prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    {},
  );

  const err = (field: string) => state.fieldErrors?.[field];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center rounded-full border border-line px-3 py-1 text-[0.8rem] text-ink-soft transition-colors hover:border-accent hover:text-accent"
      >
        Editar datos del evento
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-4 space-y-4 rounded-xl border border-line bg-white p-5">
      <Field label="Quién invita" error={err("hostNames")}>
        <Input name="hostNames" defaultValue={hostNames ?? ""} placeholder="Ana y Carlos" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha" error={err("date")}>
          <Input name="date" type="date" defaultValue={date} required />
        </Field>
        <Field label="Hora" error={err("time")}>
          <Input name="time" type="time" defaultValue={time} required />
        </Field>
      </div>

      <Field label="Lugar" error={err("venueName")}>
        <Input name="venueName" defaultValue={venueName ?? ""} placeholder="Hacienda San Pedro" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Dirección" error={err("venueAddress")}>
          <Input
            name="venueAddress"
            defaultValue={venueAddress ?? ""}
            placeholder="Calle y número"
          />
        </Field>
        <Field label="Ciudad" error={err("venueCity")}>
          <Input name="venueCity" defaultValue={venueCity ?? ""} placeholder="Monterrey" />
        </Field>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="rsvpRequired"
          defaultChecked={rsvpRequired}
          className="mt-1 size-4 accent-[var(--accent)]"
        />
        <span>
          <span className="text-[0.95rem] font-medium text-ink">Pedir confirmación</span>
          <span className="block text-[0.82rem] text-ink-muted">
            El asistente le pregunta a cada invitado si podrá acompañarte.
          </span>
        </span>
      </label>

      {invitedCount > 0 && (
        <p className="text-[0.82rem] leading-relaxed text-ink-muted">
          Ya enviaste {invitedCount} {invitedCount === 1 ? "invitación" : "invitaciones"}. Lo
          que cambies aquí no cambia lo que esas personas ya recibieron, pero el asistente sí
          contestará con los datos nuevos de aquí en adelante.
        </p>
      )}

      {state.error && <p className="text-[0.9rem] text-accent">{state.error}</p>}

      <div className="flex items-center gap-3">
        <SubmitButton>{pending ? "Guardando…" : "Guardar"}</SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-[0.85rem] text-ink-muted hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
