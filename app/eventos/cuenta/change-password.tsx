"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

/**
 * Changing your own password.
 *
 * The current password is required by better-auth and that is the point: a
 * session left open on a borrowed laptop should not be enough to lock the owner
 * out of their own account.
 *
 * Other sessions are revoked on success. Somebody changing a password usually
 * has a reason, and leaving the old sessions alive would defeat it.
 */
export function ChangePassword({ minLength }: { minLength: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(formData: FormData) {
    const currentPassword = String(formData.get("current") ?? "");
    const newPassword = String(formData.get("next") ?? "");
    const repeat = String(formData.get("repeat") ?? "");

    setError(null);
    setDone(false);

    if (newPassword !== repeat) return setError("La nueva contraseña no coincide.");
    if (newPassword.length < minLength) {
      return setError(`La nueva contraseña necesita al menos ${minLength} caracteres.`);
    }
    if (newPassword === currentPassword) {
      return setError("La nueva contraseña es igual a la actual.");
    }

    setBusy(true);
    const { error: failed } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setBusy(false);

    if (failed) {
      // The one failure worth naming precisely: everything else is a surprise.
      setError(
        failed.status === 400
          ? "La contraseña actual no es correcta."
          : (failed.message ?? "No pudimos cambiarla. Inténtalo otra vez."),
      );
      return;
    }

    setDone(true);
  }

  return (
    <form action={onSubmit} className="mt-8 max-w-sm space-y-4">
      <Field name="current" label="Contraseña actual" autoComplete="current-password" />
      <Field
        name="next"
        label="Nueva contraseña"
        autoComplete="new-password"
        help={`Mínimo ${minLength} caracteres.`}
      />
      <Field name="repeat" label="Repite la nueva" autoComplete="new-password" />

      {error && <p className="text-[0.88rem] text-danger">{error}</p>}
      {done && (
        <p className="text-[0.88rem] text-ink-soft">
          Listo, tu contraseña cambió. Si habías iniciado sesión en otro dispositivo, ahí se
          cerró.
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-action px-6 py-2.5 text-[0.9rem] font-medium text-ink-onaction transition-colors hover:bg-action-soft disabled:opacity-50"
      >
        {busy ? "Cambiando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  autoComplete,
  help,
}: {
  name: string;
  label: string;
  autoComplete: string;
  help?: string;
}) {
  return (
    <label className="block">
      <span className="text-[0.9rem] text-ink-soft">{label}</span>
      <input
        name={name}
        type="password"
        required
        autoComplete={autoComplete}
        className="mt-1.5 w-full rounded-lg border border-line bg-paper-deep px-3 py-2.5 text-ink outline-none transition-colors focus:border-accent"
      />
      {help && <span className="mt-1 block text-[0.8rem] text-ink-muted">{help}</span>}
    </label>
  );
}
