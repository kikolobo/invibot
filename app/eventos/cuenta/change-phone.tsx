"use client";

import { useActionState } from "react";
import { updateMyPhone, type PhoneState } from "./actions";

/**
 * Your WhatsApp, the one invitations find you by and guests' questions reach.
 */
export function ChangePhone({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState<PhoneState, FormData>(updateMyPhone, {});

  return (
    <form action={action} className="mt-8 max-w-sm space-y-4">
      <label className="block">
        <span className="text-[0.9rem] text-ink-soft">Tu WhatsApp</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          defaultValue={current ?? ""}
          placeholder="55 1234 5678"
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink"
        />
      </label>

      {state.error && <p className="text-[0.88rem] text-danger">{state.error}</p>}
      {state.ok && <p className="text-[0.88rem] text-ink-soft">{state.ok}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-action px-6 py-2.5 text-[0.9rem] text-ink-onaction disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar número"}
      </button>
    </form>
  );
}
