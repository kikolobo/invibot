"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { startEvent, type ActionState } from "@/lib/events/actions";
import { previewPin, saveWizardStep, type WizardStep } from "@/lib/events/wizard";
import { eventKinds, eventKindLabels, type EventKind } from "@/lib/events/kinds";
import { countries, mexicanStates } from "@/lib/events/places";
import { timezoneFor, timezoneOptions } from "@/lib/events/zones";
import { venueQuery } from "@/lib/events/maps";
import { lookupPostalCode } from "@/lib/events/postal";
import { Field, Input, Select } from "@/components/ui/field";
import {
  ContactsWay,
  ImportWay,
  NOTHING_SENT,
  OneByOneWay,
  RegistrationWay,
} from "../[id]/invitados/ways";
import type { WaysToAdd } from "@/lib/guests/ways";

/**
 * The new-event wizard, one short screen at a time. Every step can be left
 * with «Lo completo después», which saves what is there and goes to the
 * questionnaire; everything here is in «Editar» afterwards too.
 */
const TOTAL = 5;

function Progress({ step }: { step: WizardStep }) {
  return (
    <div>
      <p className="eyebrow">
        Paso {step} de {TOTAL}
      </p>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {Array.from({ length: TOTAL }, (_, index) => (
          <span
            key={index}
            className={`h-1 flex-1 rounded-full ${index < step ? "bg-accent" : "bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}

function Buttons({
  step,
  backHref,
  going,
}: {
  step: WizardStep;
  backHref?: string;
  /** Which button is saving, while it is. */
  going: string | null;
}) {
  const pending = going !== null;
  return (
    // «Siguiente» comes first in the markup so Enter in a field means it.
    <div className="flex flex-col-reverse gap-4 border-t border-line pt-6 sm:flex-row-reverse sm:items-center sm:justify-between">
      <div className="flex flex-col-reverse gap-3 sm:flex-row-reverse sm:items-center">
        <button
          type="submit"
          name="intent"
          value="next"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-full bg-action px-7 py-3 text-sm font-medium text-ink-onaction transition-colors hover:bg-action-soft disabled:opacity-60"
        >
          {going === "next" ? "Guardando…" : step === TOTAL ? "Terminar" : "Siguiente"}
        </button>
        <button
          type="submit"
          name="intent"
          value="later"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-full border border-line px-6 py-3 text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink disabled:opacity-60"
        >
          {going === "later" ? "Guardando…" : "Lo completo después"}
        </button>
      </div>
      {backHref ? (
        <Link href={backHref} className="text-[0.85rem] text-ink-muted transition-colors hover:text-ink">
          ← Atrás
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

function Frame({
  step,
  title,
  intro,
  children,
  action,
  state,
  backHref,
  aside,
}: {
  step: WizardStep;
  title: ReactNode;
  intro: ReactNode;
  children?: ReactNode;
  action: (formData: FormData) => void;
  state: ActionState;
  backHref?: string;
  /** Above the form, for panels that act on their own — a form cannot hold another. */
  aside?: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [intent, setIntent] = useState<string | null>(null);

  // Sent by hand rather than through `<form action>`, which clears every
  // field once the action returns — including when it returns only to say
  // what is missing. This way a refused step keeps everything typed and
  // marks the gaps. No browser validation either: it stops at the first
  // empty field, and the server names them all at once.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(e.currentTarget, submitter);
    setIntent(String(data.get("intent") ?? "next"));
    startTransition(() => action(data));
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
      <Progress step={step} />
      <h1 className="mt-8 font-display text-4xl leading-tight text-ink sm:text-5xl">{title}</h1>
      <div className="mt-4 max-w-prose leading-relaxed text-ink-soft">{intro}</div>
      {aside && <div className="mt-10 space-y-5">{aside}</div>}
      <form onSubmit={submit} noValidate className="mt-10 space-y-7">
        {children}
        {state.error && <p className="text-[0.9rem] text-danger">{state.error}</p>}
        {state.fieldErrors && !state.error && (
          <p className="text-[0.9rem] text-danger">Revisa lo que está marcado arriba.</p>
        )}
        <Buttons step={step} backHref={backHref} going={pending ? intent : null} />
      </form>
    </div>
  );
}

const back = (eventId: string, step: number) => `/eventos/nuevo/${eventId}?paso=${step}`;

const namePlaceholders: Record<EventKind, string> = {
  wedding: "Boda de Ana y Carlos",
  birthday: "Los 40 de Mariana",
  quinceanera: "XV años de Valeria",
  corporate: "Cena de fin de año",
  product_launch: "Lanzamiento Primavera",
  anniversary: "25 años de Rosa y Luis",
  baby_shower: "Baby shower de Sofía",
  graduation: "Graduación de Diego",
  other: "Nombre del evento",
};

export function StepOne({
  eventId,
  firstName,
  defaults,
}: {
  /** Absent until the event exists: this step is what creates it. */
  eventId?: string;
  firstName: string | null;
  defaults?: { kind: EventKind; name: string; date: string; time: string };
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    eventId ? saveWizardStep.bind(null, eventId, 1) : startEvent,
    {},
  );
  const [kind, setKind] = useState<EventKind | null>(defaults?.kind ?? null);
  const err = (key: string) => state.fieldErrors?.[key];

  return (
    <Frame
      step={1}
      action={action}
      state={state}
      title={eventId ? "Lo básico" : firstName ? `¡Hola, ${firstName}! Empecemos` : "¡Hola! Empecemos"}
      intro={
        <>
          <p>
            Vamos a armar tu evento en cinco pasos cortos. Con lo que nos cuentes,{" "}
            <span className="font-medium text-ink">Aura</span> manda tus invitaciones, confirma a tus
            invitados y les contesta sus dudas por ti.
          </p>
          <p className="mt-3 text-[0.9rem] text-ink-muted">
            Lo que todavía no sepas, lo completas después.
          </p>
        </>
      }
    >
      <Field label="¿Qué vas a celebrar?" required error={err("kind")}>
        <div className="flex flex-wrap gap-2">
          {eventKinds.map((value) => (
            <label
              key={value}
              className="cursor-pointer rounded-full border border-line bg-paper-deep px-4 py-2 text-[0.88rem] text-ink-soft transition-colors has-checked:border-accent has-checked:bg-action has-checked:text-ink-onaction"
            >
              <input
                type="radio"
                name="kind"
                value={value}
                defaultChecked={defaults?.kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              {eventKindLabels[value].es}
            </label>
          ))}
        </div>
      </Field>

      <Field label="¿Cómo se llama?" help="Así lo van a leer tus invitados." required error={err("name")}>
        <Input
          name="name"
          defaultValue={defaults?.name}
          placeholder={namePlaceholders[kind ?? "other"]}
          maxLength={120}
          required
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="¿Qué día?" required error={err("date")}>
          <Input type="date" name="date" defaultValue={defaults?.date} required />
        </Field>
        <Field label="¿A qué hora empieza?" required error={err("time")}>
          <Input type="time" name="time" defaultValue={defaults?.time ?? "19:00"} required />
        </Field>
      </div>
    </Frame>
  );
}

export function StepTwo({
  eventId,
  defaults,
}: {
  eventId: string;
  defaults: { hostNames: string; responderName: string; responderPhone: string };
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    saveWizardStep.bind(null, eventId, 2),
    {},
  );
  const err = (key: string) => state.fieldErrors?.[key];

  return (
    <Frame
      step={2}
      action={action}
      state={state}
      backHref={back(eventId, 1)}
      title="¿Quién invita?"
      intro={<p>Cómo firma la invitación, y a quién le escribimos cuando un invitado pregunte algo que Aura no sabe.</p>}
    >
      <Field
        label="¿Quién invita?"
        help="Como quieres que lo lean tus invitados: «Ana y Carlos», «Familia González»."
        error={err("hostNames")}
      >
        <Input name="hostNames" defaultValue={defaults.hostNames} placeholder="Ana y Carlos" maxLength={120} />
      </Field>

      <div className="space-y-5 rounded-xl border border-line bg-paper-deep p-5">
        <div>
          <p className="text-[0.95rem] font-medium text-ink">¿Quién contesta las dudas?</p>
          <p className="mt-1 text-[0.82rem] leading-relaxed text-ink-muted">
            Cuando Aura no sepa algo, le escribe por WhatsApp a esta persona y le pasa la respuesta al
            invitado. Puedes ser tú o alguien de tu equipo.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre" error={err("responderName")}>
            <Input name="responderName" defaultValue={defaults.responderName} maxLength={120} />
          </Field>
          <Field label="WhatsApp" error={err("responderPhone")}>
            <Input
              name="responderPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={defaults.responderPhone}
              placeholder="55 1234 5678"
            />
          </Field>
        </div>
      </div>
    </Frame>
  );
}

export function StepThree({
  eventId,
  defaults,
}: {
  eventId: string;
  defaults: {
    venueName: string;
    venueAddress: string;
    venuePostalCode: string;
    venueCity: string;
    venueState: string;
    venueCountry: string;
    venueMapsUrl: string;
    timezone: string;
    /** Whether the zone was ever chosen; a fresh event's is only the default. */
    timezoneSet: boolean;
  };
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    saveWizardStep.bind(null, eventId, 3),
    {},
  );
  const err = (key: string) => state.fieldErrors?.[key];
  const [country, setCountry] = useState(defaults.venueCountry);
  const [region, setRegion] = useState(defaults.venueState);
  const [street, setStreet] = useState(defaults.venueAddress);
  const [city, setCity] = useState(defaults.venueCity);
  const [link, setLink] = useState(defaults.venueMapsUrl);
  const [postal, setPostal] = useState(defaults.venuePostalCode);
  const [postalNote, setPostalNote] = useState<{ found: boolean; text: string } | null>(null);
  const lastLookup = useRef("");

  // Five digits in Mexico fill the city and state — the code is the more
  // deliberate of the two, so it wins over whatever was typed before.
  async function onPostal(value: string) {
    setPostal(value);
    setPostalNote(null);
    const code = value.trim();
    lastLookup.current = code;
    if (country !== "MX" || !/^\d{5}$/.test(code)) return;
    const place = await lookupPostalCode(code);
    if (lastLookup.current !== code) return;
    if (!place) {
      setPostalNote({ found: false, text: "No encontramos ese código. Escribe la ciudad y el estado." });
      return;
    }
    setCity(place.city);
    setRegion(place.state);
    setPostalNote({ found: true, text: `${place.city}, ${place.state}` });
  }
  // Exactly what the server will search when there is no link to read.
  const searched = venueQuery({
    venueName: null,
    venueMapsUrl: null,
    venueAddress: street,
    venuePostalCode: postal,
    venueCity: city,
    venueState: region,
    venueCountry: country,
  });
  const [picked, setPicked] = useState<string | null>(defaults.timezoneSet ? defaults.timezone : null);
  const [choosing, setChoosing] = useState(false);
  const timezone = picked ?? timezoneFor(country, region);
  const zoneLabel = timezoneOptions.find((option) => option.value === timezone)?.label ?? timezone;

  return (
    <Frame
      step={3}
      action={action}
      state={state}
      backHref={back(eventId, 2)}
      title="¿Dónde va a ser?"
      intro={<p>Con la dirección, Aura le manda el mapa a quien pregunte cómo llegar.</p>}
    >
      <Field label="Lugar" error={err("venueName")}>
        <Input name="venueName" defaultValue={defaults.venueName} placeholder="Hacienda San Gabriel" maxLength={160} />
      </Field>

      <Field label="Dirección" help="Calle, número y colonia." error={err("venueAddress")}>
        <Input
          name="venueAddress"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder="Camino Real 120, Col. Centro"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Código postal (opcional)" error={err("venuePostalCode")}>
          <Input
            name="venuePostalCode"
            value={postal}
            onChange={(e) => onPostal(e.target.value)}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={12}
            placeholder="62000"
          />
          {postalNote ? (
            <p className={`text-[0.8rem] ${postalNote.found ? "text-ink-muted" : "text-danger"}`}>
              {postalNote.found ? `✓ ${postalNote.text}` : postalNote.text}
            </p>
          ) : (
            country === "MX" && (
              <p className="text-[0.75rem] text-ink-muted">
                Llena la ciudad y el estado. Datos de{" "}
                <a href="https://www.geonames.org" target="_blank" rel="noreferrer" className="underline">
                  GeoNames
                </a>{" "}
                (CC BY 4.0).
              </p>
            )
          )}
        </Field>
        <Field label="Ciudad" error={err("venueCity")}>
          <Input
            name="venueCity"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Cuernavaca"
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Estado" error={err("venueState")}>
          <Input
            name="venueState"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Morelos"
            list="estados-mx"
          />
          <datalist id="estados-mx">
            {mexicanStates.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
        <Field label="País" error={err("venueCountry")}>
          <Select
            name="venueCountry"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            options={countries}
          />
        </Field>
      </div>

      <div className="space-y-4 rounded-xl border border-line bg-paper-deep p-5">
        <div>
          <p className="text-[0.95rem] font-medium text-ink">Ubicación en el mapa</p>
          {searched ? (
            <p className="mt-1 text-[0.85rem] leading-relaxed text-ink-soft">
              {link.trim() ? "Si el link no funciona, " : "Sin link, "}ubicamos el evento buscando{" "}
              <span className="text-ink">«{searched}»</span>.{" "}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searched)}`}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                Revisar en Maps ↗
              </a>
            </p>
          ) : (
            <p className="mt-1 text-[0.85rem] leading-relaxed text-ink-soft">
              {link.trim()
                ? "Ubicamos el evento con tu link."
                : "Escribe la dirección y te mostramos cómo la vamos a ubicar. Sin calle y número no podemos mandar el mapa."}
            </p>
          )}
        </div>

        <MapPreview eventId={eventId} searched={searched} link={link} />

        <Field
          label="Link de Google Maps (opcional)"
          help="Sólo si quieres un pin más preciso: una entrada por otra calle, un lugar sin número o un terreno en el campo. En Maps toca «Compartir» y pega el link aquí. Si lo pones, manda sobre la dirección."
          error={err("venueMapsUrl")}
        >
          <Input
            name="venueMapsUrl"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://maps.app.goo.gl/..."
          />
        </Field>
      </div>

      <div className="text-[0.88rem] text-ink-soft">
        <input type="hidden" name="timezone" value={timezone} />
        {choosing ? (
          <Field
            label="Zona horaria"
            help="La hora que pusiste es la hora del lugar del evento."
            error={err("timezone")}
          >
            <Select
              value={timezone}
              onChange={(e) => setPicked(e.target.value)}
              options={
                timezoneOptions.some((option) => option.value === timezone)
                  ? timezoneOptions
                  : [{ value: timezone, label: timezone }, ...timezoneOptions]
              }
            />
          </Field>
        ) : (
          <p>
            La hora del evento es la de <span className="text-ink">{zoneLabel}</span>.{" "}
            <button
              type="button"
              onClick={() => setChoosing(true)}
              className="text-accent underline-offset-2 hover:underline"
            >
              Cambiar
            </button>
          </p>
        )}
      </div>
    </Frame>
  );
}

/** Waits for typing to settle, so the map is not reloaded on every key. */
function useSettled<T>(value: T, ms = 700): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * A small map of where guests will be sent: the link's pin when there is a
 * link we can read, the address search otherwise. Google's keyless embed —
 * the same search the server runs, so what they see is what guests get.
 */
function MapPreview({ eventId, searched, link }: { eventId: string; searched: string | null; link: string }) {
  const settledLink = useSettled(link.trim());
  const settledSearch = useSettled(searched);
  const [pin, setPin] = useState<{ link: string; at: { lat: number; lng: number } | null } | null>(null);

  useEffect(() => {
    if (!settledLink) return;
    let current = true;
    previewPin(eventId, settledLink).then((at) => {
      if (current) setPin({ link: settledLink, at });
    });
    return () => {
      current = false;
    };
  }, [eventId, settledLink]);

  const read = settledLink && pin?.link === settledLink ? pin : null;
  const unreadable = Boolean(read && !read.at);
  const query = read?.at ? `${read.at.lat},${read.at.lng}` : settledSearch;

  return (
    <div className="space-y-2">
      {query ? (
        <iframe
          key={query}
          title="Ubicación del evento"
          src={`https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-52 w-full rounded-lg border border-line"
        />
      ) : (
        <div className="flex h-52 w-full items-center justify-center rounded-lg border border-dashed border-line px-6 text-center text-[0.82rem] text-ink-muted">
          Aquí vas a ver el mapa en cuanto escribas la dirección.
        </div>
      )}
      {settledLink && !read && <p className="text-[0.8rem] text-ink-muted">Leyendo tu link…</p>}
      {read?.at && <p className="text-[0.8rem] text-ink-muted">El pin viene de tu link.</p>}
      {unreadable && (
        <p className="text-[0.8rem] text-danger">
          No pudimos leer ese link. Revisa que sea el de «Compartir» en Google Maps
          {settledSearch ? "; mientras, el mapa usa la dirección." : "."}
        </p>
      )}
    </div>
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
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 size-4 accent-[var(--accent)]"
      />
      <span>
        <span className="text-[0.95rem] font-medium text-ink">{title}</span>
        <span className="block text-[0.82rem] text-ink-muted">{note}</span>
      </span>
    </label>
  );
}

export function StepFour({
  eventId,
  defaults,
}: {
  eventId: string;
  defaults: {
    rsvpRequired: boolean;
    allowPlusOnes: boolean;
    qrEnabled: boolean;
    reminderDaysBefore: number;
    /** YYYY-MM-DD, or empty for none. */
    rsvpDeadline: string;
    /** The event's own day, the latest a deadline can be. */
    eventDate: string;
  };
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    saveWizardStep.bind(null, eventId, 4),
    {},
  );
  const err = (key: string) => state.fieldErrors?.[key];

  return (
    <Frame
      step={4}
      action={action}
      state={state}
      backHref={back(eventId, 3)}
      title="¿Cómo recibes a tus invitados?"
      intro={<p>Lo que Aura hace con cada invitado. Puedes cambiarlo cuando quieras.</p>}
    >
      <div className="space-y-5 rounded-xl border border-line bg-paper-deep p-5">
        <Toggle
          name="rsvpRequired"
          defaultChecked={defaults.rsvpRequired}
          title="Pedir confirmación de asistencia"
          note="Aura le pregunta a cada invitado si podrá acompañarte."
        />
        <Toggle
          name="allowPlusOnes"
          defaultChecked={defaults.allowPlusOnes}
          title="Permitir acompañantes"
          note="Cada invitación incluye un lugar extra, y el invitado confirma si lo usa."
        />
        <Toggle
          name="qrEnabled"
          defaultChecked={defaults.qrEnabled}
          title="Enviar código de acceso (QR) · Beta"
          note="Cada invitado que confirme recibe un código único para la entrada, uno por persona, también para el acompañante. Está en beta: el control de acceso para escanearlos en la puerta todavía está en desarrollo."
        />
      </div>

      <Field
        label="Fecha límite para confirmar"
        help="Opcional. Después de ese día ya nadie puede confirmar, y Aura le explica al invitado que las confirmaciones cerraron. Decir que no van sí se sigue registrando."
        error={err("rsvpDeadline")}
      >
        <Input
          name="rsvpDeadline"
          type="date"
          defaultValue={defaults.rsvpDeadline}
          max={defaults.eventDate}
          className="max-w-52"
        />
      </Field>

      <Field
        label="¿Cuántos días antes les recordamos?"
        help="A todos los confirmados, una sola vez. El día anterior ya tiene su propio mensaje, así que 0 o 1 lo apagan."
        error={err("reminderDaysBefore")}
      >
        <Input
          name="reminderDaysBefore"
          type="number"
          min={0}
          max={30}
          inputMode="numeric"
          defaultValue={defaults.reminderDaysBefore}
          className="max-w-28"
        />
      </Field>
    </Frame>
  );
}

export function StepFive({
  eventId,
  ways,
}: {
  eventId: string;
  ways: WaysToAdd;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    saveWizardStep.bind(null, eventId, 5),
    {},
  );

  return (
    <Frame
      step={5}
      action={action}
      state={state}
      backHref={back(eventId, 4)}
      title="¿Cómo vas a agregar a tus invitados?"
      intro={
        <>
          <p>
            Hay varias formas y puedes combinarlas: unos por liga, otros de una lista, otros compartiendo su
            contacto. Usa las que quieras ahora o después, desde <span className="text-ink">Invitados</span>.
          </p>
          <p className="mt-3 text-[0.9rem] text-ink-muted">{NOTHING_SENT}</p>
        </>
      }
      aside={
        <>
          <RegistrationWay eventId={eventId} registration={ways.registration} canToggle />
          <ImportWay eventId={eventId} />
          <ContactsWay contacts={ways.contacts} />
          <OneByOneWay
            where={
              <>
                En <span className="text-ink">Invitados</span> → «Agregar invitado»,
              </>
            }
          />
        </>
      }
    />
  );
}
