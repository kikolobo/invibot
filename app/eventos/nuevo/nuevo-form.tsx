"use client";

import { useActionState, useState } from "react";
import { createEvent, type ActionState } from "@/lib/events/actions";
import { eventKinds, eventKindLabels } from "@/lib/events/kinds";
import { Field, Input, Select, SubmitButton } from "@/components/ui/field";
import { countries, mexicanStates } from "@/lib/events/places";

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
          <Input name="venueCity" placeholder="Cuernavaca" />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Estado" error={err("venueState")}>
          <Input name="venueState" placeholder="Morelos" list="estados-mx" />
          <datalist id="estados-mx">
            {mexicanStates.map((state) => (
              <option key={state} value={state} />
            ))}
          </datalist>
        </Field>
        <Field label="País" error={err("venueCountry")}>
          <Select name="venueCountry" defaultValue="MX" options={countries} />
        </Field>
      </div>
        <Field
          label="Link de Google Maps"
          help="Opcional. Pega el link de «Compartir» y el pin cae exacto. Si lo dejas vacío, buscamos la dirección de arriba."
          error={err("venueMapsUrl")}
        >
          <Input
            name="venueMapsUrl"
            type="url"
            placeholder="https://maps.app.goo.gl/..."
          />
        </Field>


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

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="autoRegisterEnabled"
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="text-[0.95rem] font-medium text-ink">
              Habilitar autorregistro con liga de WhatsApp
            </span>
            <span className="block text-[0.82rem] text-ink-muted">
              Compartes una liga en tus grupos y quien la abre se registra solo. Nadie
              recibe invitación hasta que tú lo apruebes.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input type="checkbox" name="qrEnabled" className="mt-1 size-4 accent-[var(--accent)]" />
          <span>
            <span className="text-[0.95rem] font-medium text-ink">
              Enviar código de acceso (QR)
            </span>
            <span className="block text-[0.82rem] text-ink-muted">
              Cada invitado que confirme recibe un código único para la entrada. Uno por
              persona, también para el acompañante.
            </span>
          </span>
        </label>
      </div>

      {state.error && <p className="text-[0.9rem] text-danger">{state.error}</p>}

      <SubmitButton>Continuar</SubmitButton>
    </form>
  );
}
