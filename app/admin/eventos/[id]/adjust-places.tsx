"use client";

import { useState } from "react";
import { adjustPlaces } from "@/lib/admin/actions";
import { AdminForm, Field } from "../../admin-form";

const KINDS = [
  { value: "gift", label: "Regalar lugares", submit: "Regalar", hint: "De cortesía: se suman sin cobro." },
  {
    value: "ungift",
    label: "Quitar lugares de regalo",
    submit: "Quitar",
    hint: "Sólo los de regalo; para los pagados, cancela o reembolsa el pago abajo.",
  },
  {
    value: "manual",
    label: "Registrar pago fuera de Stripe",
    submit: "Registrar pago",
    hint: "Una transferencia directa o efectivo: se suman como pagados.",
  },
] as const;

/**
 * One form for every way staff change an event's places by hand: pick what,
 * and only that option's fields show. Paid places from Stripe are not here —
 * they come off by cancelling or refunding their payment, so the money and
 * the places never disagree.
 */
export function AdjustPlaces({ eventId, gifted }: { eventId: string; gifted: number }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("gift");
  const option = KINDS.find((k) => k.value === kind)!;

  return (
    <AdminForm key={kind} action={adjustPlaces} submit={option.submit} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Qué hacer">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={k.value === kind}
            onClick={() => setKind(k.value)}
            className={`rounded-full border px-4 py-1.5 text-[0.85rem] transition-colors ${
              k.value === kind ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-soft hover:border-accent"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-[0.82rem] text-ink-muted">{option.hint}</p>
      <div className="grid max-w-lg gap-3 sm:grid-cols-2">
        <Field
          label="Lugares"
          name="slots"
          type="number"
          min={1}
          max={kind === "ungift" ? gifted || 1 : 5000}
          inputMode="numeric"
          required
        />
        {kind === "manual" && (
          <Field label="Monto recibido (MXN)" name="amount" type="number" min={0} step="0.01" inputMode="decimal" required />
        )}
      </div>
      <div className="max-w-lg">
        {kind === "manual" ? (
          <Field label="De dónde vino" name="note" required placeholder="Transferencia BBVA del 30 de octubre" />
        ) : (
          <Field label="Motivo" name="reason" required hint="Queda en Actividad." />
        )}
      </div>
    </AdminForm>
  );
}
