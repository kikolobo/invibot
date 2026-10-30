"use client";

import { useActionState, useEffect, useRef } from "react";
import type { RedeemState } from "@/lib/billing/actions";

/**
 * A courtesy code — the code alone is enough. Opened from "Usar código"
 * beside Pagar, so it takes no room until somebody has one.
 */
export function CodeForm({
  action,
  onRedeemed,
}: {
  action: (state: RedeemState, formData: FormData) => Promise<RedeemState>;
  /** Once places are added: refresh the page, or carry on sending invitations. */
  onRedeemed?: () => void;
}) {
  const [state, run, pending] = useActionState<RedeemState, FormData>(action, {});
  const done = useRef<RedeemState | null>(null);
  useEffect(() => {
    // Once per successful redemption, not on every render that still shows it.
    if (state.ok && done.current !== state) {
      done.current = state;
      onRedeemed?.();
    }
  }, [state, onRedeemed]);

  return (
    <form action={run} className="mt-3 flex max-w-md flex-wrap items-start gap-3">
      <input
        name="code"
        required
        autoFocus
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="CÓDIGO"
        aria-label="Código de cortesía"
        className="w-48 rounded-lg border border-line bg-paper px-3 py-2.5 uppercase tracking-wider text-ink"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-line px-5 py-2.5 text-[0.9rem] text-ink-soft hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {pending ? "Validando…" : "Aplicar"}
      </button>
      {state.error && <p className="w-full text-[0.88rem] text-danger">{state.error}</p>}
      {state.ok && <p className="w-full text-[0.88rem] text-ink">{state.ok}</p>}
    </form>
  );
}
