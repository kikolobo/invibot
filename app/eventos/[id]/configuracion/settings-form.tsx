"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import { updateEventSettings, type ActionState } from "@/lib/events/actions";
import { Input, SubmitButton } from "@/components/ui/field";

/**
 * How guests are received, grouped by what each decision is about. One form
 * and one «Guardar»: these are a handful of switches, and none of them is
 * announced to anyone, so there is nothing to review per section.
 */
export function SettingsForm({
  eventId,
  settings,
  eventDate,
}: {
  eventId: string;
  settings: {
    rsvpRequired: boolean;
    allowPlusOnes: boolean;
    qrEnabled: boolean;
    reminderDaysBefore: number;
    /** YYYY-MM-DD, or empty for none. */
    rsvpDeadline: string;
  };
  /** The event's own day, the latest a deadline can be. */
  eventDate: string;
}) {
  const [state, action, pending] = useActionState<ActionState & { ok?: string }, FormData>(
    updateEventSettings.bind(null, eventId),
    {},
  );
  const err = (key: string) => state.fieldErrors?.[key];

  // Sent by hand so a refused save keeps what was changed; see the wizard.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Group title="Confirmaciones">
        <Toggle
          name="rsvpRequired"
          defaultChecked={settings.rsvpRequired}
          title="Pedir confirmación de asistencia"
          note="Aura le pregunta a cada invitado si podrá acompañarte."
        />
        <div className="ml-7 space-y-1.5">
          <label htmlFor="rsvpDeadline" className="block text-[0.92rem] text-ink">
            Fecha límite para confirmar
          </label>
          <p className="text-[0.82rem] text-ink-muted">
            Opcional. Después de ese día ya nadie puede confirmar y Aura le explica al invitado que las
            confirmaciones cerraron. Decir que no van sí se sigue registrando.
          </p>
          <Input
            id="rsvpDeadline"
            name="rsvpDeadline"
            type="date"
            defaultValue={settings.rsvpDeadline}
            max={eventDate}
            className="max-w-52"
          />
          {err("rsvpDeadline") && <p className="text-[0.82rem] text-danger">{err("rsvpDeadline")}</p>}
        </div>
        <Toggle
          name="allowPlusOnes"
          defaultChecked={settings.allowPlusOnes}
          title="Permitir acompañantes"
          note="Cada invitación incluye un lugar extra y el invitado confirma si lo usa. Aplica a las invitaciones que falten por enviar; quien ya tiene la suya se queda como está."
        />
      </Group>

      <Group title="Recordatorios">
        <div className="space-y-1.5">
          <label htmlFor="reminderDaysBefore" className="block text-[0.92rem] text-ink">
            ¿Cuántos días antes les recordamos?
          </label>
          <p className="text-[0.82rem] text-ink-muted">
            A todos los confirmados, una sola vez. El día anterior ya tiene su propio mensaje, así que 0 o 1 lo
            apagan.
          </p>
          <Input
            id="reminderDaysBefore"
            name="reminderDaysBefore"
            type="number"
            min={0}
            max={30}
            inputMode="numeric"
            defaultValue={settings.reminderDaysBefore}
            className="max-w-28"
          />
          {err("reminderDaysBefore") && (
            <p className="text-[0.82rem] text-danger">{err("reminderDaysBefore")}</p>
          )}
        </div>
      </Group>

      <Group title="Acceso">
        <Toggle
          name="qrEnabled"
          defaultChecked={settings.qrEnabled}
          title="Enviar código de acceso (QR)"
          note="Cada invitado que confirme recibe un código único para la entrada, uno por persona. Apagarlo no invalida los que ya se mandaron; sólo deja de mandar nuevos."
        />
      </Group>

      {state.error && <p className="text-[0.9rem] text-danger">{state.error}</p>}
      {state.ok && !pending && <p className="text-[0.9rem] text-ink-soft">{state.ok}</p>}
      <SubmitButton>{pending ? "Guardando…" : "Guardar"}</SubmitButton>
    </form>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-paper-deep p-5">
      <p className="font-display text-lg text-ink">{title}</p>
      {children}
    </section>
  );
}

function Toggle({
  name,
  defaultChecked,
  title,
  note,
}: {
  name: string;
  defaultChecked: boolean;
  title: string;
  note: string;
}) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-4 accent-[var(--accent)]" />
      <span>
        <span className="text-[0.95rem] font-medium text-ink">{title}</span>
        <span className="block text-[0.82rem] text-ink-muted">{note}</span>
      </span>
    </label>
  );
}
