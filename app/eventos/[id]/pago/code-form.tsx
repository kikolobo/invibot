"use client";

import { useActionState } from "react";
import type { RedeemState } from "@/lib/billing/actions";

/** "¿Tienes un código de cortesía?" — the code alone is enough. */
export function CodeForm({ action }: { action: (state: RedeemState, formData: FormData) => Promise<RedeemState> }) {
  const [state, run, pending] = useActionState<RedeemState, FormData>(action, {});
  return (
    <form action={run} className="mt-4 flex max-w-md flex-wrap items-start gap-3">
      <input
        name="code"
        required
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="CÓDIGO"
        className="w-48 rounded-lg border border-line bg-paper px-3 py-2.5 uppercase tracking-wider text-ink"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-line px-5 py-2.5 text-[0.9rem] text-ink-soft hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {pending ? "Validando…" : "Usar código"}
      </button>
      {state.error && <p className="w-full text-[0.88rem] text-danger">{state.error}</p>}
      {state.ok && <p className="w-full text-[0.88rem] text-ink">{state.ok}</p>}
    </form>
  );
}
