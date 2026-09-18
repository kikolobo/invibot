"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { updateEventBasics, type BasicsResult } from "@/lib/events/actions";
import { notifyGuestsOfChange, type NotifyResult } from "@/lib/events/notify";
import { changeLabels, type EventChange } from "@/lib/events/changes";
import { Field, Input, Select, SubmitButton } from "@/components/ui/field";
import { countries, mexicanStates } from "@/lib/events/places";

/**
 * The event's details, edited the way they were entered.
 *
 * One form rather than a button beside every field: the fields describe one
 * thing and are usually corrected together — a venue moving tends to move the
 * date with it — and a page of small edit buttons made a simple correction
 * feel like six separate decisions.
 */
export function EditForm({
  eventId,
  event,
  date,
  time,
  audience,
}: {
  eventId: string;
  event: {
    name: string;
    hostNames: string | null;
    venueName: string | null;
    venueAddress: string | null;
    venueState: string | null;
    venueCountry: string | null;
    venueMapsUrl: string | null;
    venueCity: string | null;
    rsvpRequired: boolean;
    allowPlusOnes: boolean;
    qrEnabled: boolean;
  };
  date: string;
  time: string;
  /** How many guests each kind of notice would reach. */
  audience: { updated: number; informed: number };
}) {
  const [state, formAction, pending] = useActionState<BasicsResult, FormData>(
    updateEventBasics.bind(null, eventId),
    {},
  );
  const [notice, setNotice] = useState<NotifyResult | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const err = (field: string) => state.fieldErrors?.[field];
  const changed = (state.changed ?? []) as EventChange[];
  const reachable = audience.updated + audience.informed;

  return (
    <>
      {state.ok && changed.length > 0 && !dismissed && (
        <section className="mb-8 rounded-xl border border-accent/30 bg-action/5 p-5">
          <p className="font-display text-lg text-ink">
            Guardado. Cambiaste {changed.map((c) => changeLabels[c]).join(", ")}.
          </p>

          {state.summary && reachable > 0 ? (
            <>
              <p className="mt-2 max-w-prose text-[0.88rem] leading-relaxed text-ink-muted">
                ¿Les avisamos? Quien todavía no contesta recibe la invitación otra vez, ya
                actualizada y con sus botones. Quien ya confirmó recibe sólo el aviso, sin
                botones: ya contestó.
              </p>
              <p className="mt-2 text-[0.85rem] text-ink-soft">
                «{state.summary}» · {audience.updated}{" "}
                {audience.updated === 1 ? "invitación" : "invitaciones"} de nuevo ·{" "}
                {audience.informed} {audience.informed === 1 ? "aviso" : "avisos"}
              </p>

              {notice && (
                <p className="mt-3 text-[0.88rem] text-ink-soft">
                  {notice.error ??
                    `Enviamos ${notice.updated} ${notice.updated === 1 ? "invitación" : "invitaciones"} y ${notice.informed} ${notice.informed === 1 ? "aviso" : "avisos"}.` +
                      (notice.failed ? ` ${notice.failed} no se pudieron enviar.` : "")}
                </p>
              )}

              {!notice && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={notifying}
                    onClick={async () => {
                      setNotifying(true);
                      setNotice(await notifyGuestsOfChange(eventId, state.summary!));
                      setNotifying(false);
                    }}
                    className="rounded-full bg-action px-5 py-2 text-[0.85rem] text-paper disabled:opacity-50"
                  >
                    {notifying ? "Avisando…" : "Avisar a los invitados"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    disabled={notifying}
                    className="text-[0.85rem] text-ink-muted hover:text-ink disabled:opacity-50"
                  >
                    No avisar
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 max-w-prose text-[0.88rem] leading-relaxed text-ink-muted">
              {state.summary
                ? "Todavía no hay invitados a quienes avisar."
                : "Nada de esto cambia lo que ya recibieron tus invitados, así que no hay nada que avisar. La regla de acompañantes aplica a las invitaciones que falten por enviar."}
            </p>
          )}
        </section>
      )}

      <form action={formAction} className="space-y-5">
        <Field label="Nombre del evento" error={err("name")} required>
          <Input name="name" defaultValue={event.name} maxLength={120} required />
        </Field>

        <Field label="Quién invita" error={err("hostNames")}>
          <Input name="hostNames" defaultValue={event.hostNames ?? ""} placeholder="Ana y Carlos" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha" error={err("date")} required>
            <Input name="date" type="date" defaultValue={date} required />
          </Field>
          <Field label="Hora" error={err("time")} required>
            <Input name="time" type="time" defaultValue={time} required />
          </Field>
        </div>

        <Field label="Lugar" error={err("venueName")}>
          <Input name="venueName" defaultValue={event.venueName ?? ""} placeholder="Hacienda San Pedro" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dirección" error={err("venueAddress")}>
            <Input name="venueAddress" defaultValue={event.venueAddress ?? ""} placeholder="Calle y número" />
          </Field>
          <Field label="Ciudad" error={err("venueCity")}>
            <Input name="venueCity" defaultValue={event.venueCity ?? ""} placeholder="Monterrey" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Estado" error={err("venueState")}>
            <Input
              name="venueState"
              defaultValue={event.venueState ?? ""}
              placeholder="Nuevo León"
              list="estados-mx"
            />
            <datalist id="estados-mx">
              {mexicanStates.map((state) => (
                <option key={state} value={state} />
              ))}
            </datalist>
          </Field>
          <Field label="País" error={err("venueCountry")}>
            <Select
              name="venueCountry"
              defaultValue={event.venueCountry ?? "MX"}
              options={countries}
            />
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
            defaultValue={event.venueMapsUrl ?? ""}
            placeholder="https://maps.app.goo.gl/..."
          />
        </Field>


        <div className="space-y-3 border-t border-line pt-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="rsvpRequired"
              defaultChecked={event.rsvpRequired}
              className="mt-1 size-4 accent-[var(--accent)]"
            />
            <span>
              <span className="text-[0.95rem] font-medium text-ink">Pedir confirmación</span>
              <span className="block text-[0.82rem] text-ink-muted">
                El asistente le pregunta a cada invitado si podrá acompañarte.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="allowPlusOnes"
              defaultChecked={event.allowPlusOnes}
              className="mt-1 size-4 accent-[var(--accent)]"
            />
            <span>
              <span className="text-[0.95rem] font-medium text-ink">Permitir acompañantes</span>
              <span className="block text-[0.82rem] text-ink-muted">
                Aplica a las invitaciones que falten por enviar. Quien ya tiene la suya se
                queda como está.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="qrEnabled"
              defaultChecked={event.qrEnabled}
              className="mt-1 size-4 accent-[var(--accent)]"
            />
            <span>
              <span className="text-[0.95rem] font-medium text-ink">
                Enviar código de acceso (QR)
              </span>
              <span className="block text-[0.82rem] text-ink-muted">
                Cada invitado que confirme recibe un código único para la entrada.
              </span>
            </span>
          </label>
        </div>

        {state.error && <p className="text-[0.9rem] text-danger">{state.error}</p>}

        <div className="flex items-center gap-4">
          <SubmitButton>{pending ? "Guardando…" : "Guardar cambios"}</SubmitButton>
          <Link
            href={`/eventos/${eventId}`}
            className="text-[0.85rem] text-ink-muted transition-colors hover:text-ink"
          >
            Volver
          </Link>
        </div>
      </form>
    </>
  );
}
