"use client";

import { useActionState, useState } from "react";
import type { CheckoutState } from "@/lib/billing/actions";

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(minor / 100);

/**
 * How many places, what that comes to, and off to Stripe. The total is shown
 * as they type, rounded up to the minimum the way the server will round it.
 */
export function BuyForm({
  action,
  suggested,
  unitAmountMinor,
  minimumSlots,
  currency,
}: {
  action: (state: CheckoutState, formData: FormData) => Promise<CheckoutState>;
  suggested: number;
  unitAmountMinor: number;
  minimumSlots: number;
  currency: string;
}) {
  const [state, run, pending] = useActionState<CheckoutState, FormData>(action, {});
  const [slots, setSlots] = useState(Math.max(suggested, minimumSlots));
  const billed = Math.max(slots || 0, minimumSlots);

  return (
    <form action={run} className="mt-6 max-w-sm space-y-4">
      <label className="block">
        <span className="text-[0.9rem] text-ink-soft">Lugares</span>
        <input
          name="slots"
          type="number"
          min={1}
          max={5000}
          inputMode="numeric"
          value={slots || ""}
          onChange={(event) => setSlots(Number(event.target.value))}
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink"
        />
      </label>
      <p className="text-[0.9rem] text-ink-soft">
        {billed} × {money(unitAmountMinor, currency)} ={" "}
        <span className="font-display text-2xl text-ink">{money(billed * unitAmountMinor, currency)}</span>
        <span className="block text-[0.8rem] text-ink-muted">
          IVA incluido.{" "}
          {slots < minimumSlots && `La compra mínima es de ${minimumSlots} lugares; los que sobren se quedan en el evento.`}
        </span>
      </p>
      {state.error && <p className="text-[0.88rem] text-danger">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-action px-6 py-2.5 text-[0.9rem] text-ink-onaction disabled:opacity-50"
      >
        {pending ? "Abriendo el pago…" : "Pagar con tarjeta, OXXO o transferencia"}
      </button>
    </form>
  );
}
