"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { unlockSignup, type UnlockState } from "./unlock";

/**
 * The door.
 *
 * Someone who does not have the code is not turned away with nothing: an event
 * is a real thing they are trying to organise, and an email gets them a person.
 */
export function PasscodeForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<UnlockState, FormData>(
    async (prev, data) => {
      const result = await unlockSignup(prev, data);
      // No error means the cookie is set; the page re-renders past the door.
      if (!result.error) router.refresh();
      return result;
    },
    {},
  );

  return (
    <form action={action} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-[0.9rem] text-ink-soft">Código de acceso</span>
        <input
          name="passcode"
          type="password"
          autoFocus
          autoComplete="off"
          required
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink"
        />
      </label>

      {state.error && <p className="text-[0.88rem] text-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-action px-6 py-3 text-[0.9rem] text-paper disabled:opacity-50"
      >
        {pending ? "Comprobando…" : "Continuar"}
      </button>

      <p className="pt-2 text-[0.85rem] leading-relaxed text-ink-muted">
        ¿No tienes código? Estamos abriendo poco a poco.{" "}
        <a
          href="mailto:hola@invibot.com?subject=Quiero%20probar%20Invibot&body=Hola%2C%20me%20interesa%20probar%20Invibot.%0A%0ATipo%20de%20evento%3A%20%0AFecha%20aproximada%3A%20%0AN%C3%BAmero%20de%20invitados%3A%20"
          className="text-accent hover:underline"
        >
          Escríbenos
        </a>{" "}
        y lo vemos contigo.
      </p>
    </form>
  );
}
