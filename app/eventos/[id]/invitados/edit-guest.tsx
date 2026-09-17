"use client";

import { useActionState, useState } from "react";
import { updateGuest, type GuestActionState } from "@/lib/guests/actions";
import { Input } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import type { GuestRow } from "./guest-table";
import { MAX_PARTY_SIZE } from "@/lib/events/party";

/**
 * Correcting one guest in place.
 *
 * The RSVP selector is here because an organizer is told things the assistant
 * never hears — in person, by phone, through someone else — and until they can
 * write that down the list is only ever as complete as WhatsApp.
 */

const rsvpChoices = [
  { value: "no_response", label: "Sin responder" },
  { value: "confirmed", label: "Confirmado" },
  { value: "declined", label: "No podrá" },
  { value: "maybe", label: "Tal vez" },
];

export function EditGuest({
  eventId,
  guest,
  groups,
  maxPartySize,
  onDone,
}: {
  eventId: string;
  guest: GuestRow;
  groups: string[];
  maxPartySize: number;
  onDone: () => void;
}) {
  // Both fields are live because the count depends on them: it only means
  // anything once they are coming, and it cannot exceed what they were offered.
  const [rsvp, setRsvp] = useState(guest.rsvpStatus);
  const [companion, setCompanion] = useState(guest.partySizeAllowed > 1);

  const maxConfirmable = companion ? Math.min(MAX_PARTY_SIZE, maxPartySize) : 1;

  const [state, formAction, pending] = useActionState<GuestActionState, FormData>(
    async (prev: GuestActionState, formData: FormData) => {
      const result = await updateGuest(eventId, guest.id, prev, formData);
      if (result.ok) onDone();
      return result;
    },
    {},
  );

  return (
    <form action={formAction} className="rounded-xl border border-line bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="fullName" defaultValue={guest.fullName} placeholder="Nombre completo" required />
        <Input
          name="phone"
          defaultValue={guest.phoneE164 ?? ""}
          placeholder="55 1234 5678"
          inputMode="tel"
        />
        <Input
          name="email"
          type="email"
          defaultValue={guest.email ?? ""}
          placeholder="correo@ejemplo.com"
        />
        <Combobox
          name="group"
          options={groups}
          value={guest.groupName ?? ""}
          placeholder="Grupo o relación"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-[0.88rem] text-ink-soft">
          Mesa
          <Input
            name="tableNumber"
            defaultValue={guest.tableNumber ?? ""}
            inputMode="numeric"
            maxLength={5}
            pattern="\\d*"
            placeholder="—"
            className="max-w-24"
          />
        </label>
        <label className="flex items-center gap-2 text-[0.88rem] text-ink-soft">
          <input
            type="checkbox"
            name="isVip"
            defaultChecked={guest.isVip}
            className="size-4 accent-[var(--accent)]"
          />
          VIP
          <span className="text-[0.78rem] text-ink-muted">(sólo tú lo ves)</span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-[0.88rem] text-ink-soft">
          Asistencia
          <select
            name="rsvpStatus"
            value={rsvp}
            onChange={(e) => setRsvp(e.target.value as GuestRow["rsvpStatus"])}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-[0.88rem] text-ink outline-none focus:border-accent"
          >
            {rsvpChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>

        {maxPartySize > 1 && (
          <label className="flex items-center gap-2 text-[0.88rem] text-ink-soft">
            <input
              type="checkbox"
              name="bringsCompanion"
              checked={companion}
              onChange={(e) => setCompanion(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Puede traer acompañante
          </label>
        )}

        {rsvp === "confirmed" && (
          <label className="flex items-center gap-2 text-[0.88rem] text-ink-soft">
            Número de confirmados
            <select
              name="partySizeConfirmed"
              defaultValue={String(Math.min(guest.partySizeConfirmed ?? 1, maxConfirmable))}
              key={maxConfirmable}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-[0.88rem] text-ink outline-none focus:border-accent"
            >
              {Array.from({ length: maxConfirmable }, (_, index) => index + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {rsvp === "confirmed" && maxConfirmable === 1 && maxPartySize > 1 && (
        <p className="mt-3 text-[0.8rem] text-ink-muted">
          Para confirmar dos personas, primero marca que puede traer acompañante.
        </p>
      )}

      {guest.inviteStatus !== "pending" && (
        <p className="mt-3 text-[0.8rem] leading-relaxed text-ink-muted">
          Si corriges el teléfono, la invitación que ya salió se fue al número anterior.
          Le volveremos a aparecer en la lista de por invitar.
        </p>
      )}

      {state.error && <p className="mt-3 text-[0.85rem] text-accent">{state.error}</p>}

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
          onClick={onDone}
          disabled={pending}
          className="text-[0.85rem] text-ink-muted hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
