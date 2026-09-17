"use client";

import { useActionState, useState } from "react";
import { createEvent, type ActionState } from "@/lib/events/actions";
import { eventKinds, eventKindLabels } from "@/lib/events/kinds";
import { Field, Input, Select, SubmitButton } from "@/components/ui/field";

const timezones = [
  "America/Mexico_City",
  "America/Cancun",
  "America/Monterrey",
  "America/Tijuana",
  "America/Hermosillo",
  "America/Mazatlan",
];

export function NuevoForm() {
  const [state, action] = useActionState<ActionState, FormData>(createEvent, {});
  const [allowPlusOnes, setAllowPlusOnes] = useState(false);
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <form action={action} className="mt-10 space-y-7">
      <Field label="¿Qué tipo de evento es?" required error={err("kind")}>
        <Select
          name="kind"
          defaultValue="wedding"
          options={eventKinds.map((k) => ({ value: k, label: eventKindLabels[k].es }))}
        />
      </Field>

      <Field label="Nombre del evento" required error={err("name")}>
        <Input name="name" placeholder="Boda de Ana y Carlos" required />
      </Field>

      <Field
        label="¿Quién invita?"
        help="Como quieres que lo lean tus invitados."
        error={err("hostNames")}
      >
        <Input name="hostNames" placeholder="Ana & Carlos" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Fecha" required error={err("date")}>
          <Input type="date" name="date" required />
        </Field>
        <Field label="Hora de inicio" required error={err("time")}>
          <Input type="time" name="time" defaultValue="19:00" required />
        </Field>
      </div>

      <Field
        label="Zona horaria"
        help="La hora que escribiste es la hora local del lugar del evento."
        error={err("timezone")}
      >
        <Select
          name="timezone"
          defaultValue="America/Mexico_City"
          options={timezones.map((t) => ({ value: t, label: t.replace("America/", "") }))}
        />
      </Field>

      <Field label="Lugar" error={err("venueName")}>
        <Input name="venueName" placeholder="Hacienda San Gabriel" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Dirección" error={err("venueAddress")}>
          <Input name="venueAddress" placeholder="Camino Real 120" />
        </Field>
        <Field label="Ciudad" error={err("venueCity")}>
          <Input name="venueCity" placeholder="Cuernavaca, Morelos" />
        </Field>
      </div>

      <div className="space-y-4 rounded-xl border border-line bg-paper-deep p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="rsvpRequired"
            defaultChecked
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="text-[0.95rem] font-medium text-ink">
              Pedir confirmación de asistencia
            </span>
            <span className="block text-[0.82rem] text-ink-muted">
              El asistente le preguntará a cada invitado si podrá acompañarte.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="allowPlusOnes"
            checked={allowPlusOnes}
            onChange={(e) => setAllowPlusOnes(e.target.checked)}
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="text-[0.95rem] font-medium text-ink">
              Permitir acompañantes
            </span>
            <span className="block text-[0.82rem] text-ink-muted">
              Cada invitación incluye un lugar extra, y el invitado confirma si lo usa.
            </span>
          </span>
        </label>

      </div>

      {state.error && <p className="text-[0.9rem] text-accent">{state.error}</p>}

      <SubmitButton>Continuar</SubmitButton>
    </form>
  );
}
