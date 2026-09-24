"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut, signUp } from "@/lib/auth/client";
import { Field, Input, SubmitButton } from "@/components/ui/field";
import { holdInvite, joinWithAccount } from "./actions";

const messages: Record<string, string> = {
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese correo. Entra con ella para unirte.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 10 caracteres.",
};

/**
 * Signing up into an event, or accepting with the account already open.
 *
 * The number is shown and not asked for: the invitation was sent to it, and
 * the account is only let through for that number.
 */
export function JoinForm({
  token,
  eventId,
  signedInAs,
  name,
  phone,
}: {
  token: string;
  eventId: string;
  signedInAs: string | null;
  name: string;
  phone: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (signedInAs) {
    return (
      <div className="mt-10 space-y-5">
        <p className="text-[0.9rem] text-ink-soft">
          Estás en tu cuenta <span className="text-ink">{signedInAs}</span>.
        </p>
        {error && <p className="text-[0.9rem] text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-5">
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const result = await joinWithAccount(token);
              setPending(false);
              if (result?.error) setError(result.error);
            }}
            className="inline-flex items-center justify-center rounded-full bg-action px-7 py-3 text-sm font-medium text-ink-onaction transition-colors hover:bg-action-soft disabled:opacity-60"
          >
            {pending ? "Un momento…" : "Unirme al evento"}
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.refresh();
            }}
            className="text-[0.9rem] text-ink-soft hover:text-accent"
          >
            No soy yo
          </button>
        </div>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const data = new FormData(e.currentTarget);
    const held = await holdInvite(token);
    if (held.error) {
      setPending(false);
      setError(held.error);
      return;
    }

    const result = await signUp.email({
      email: String(data.get("email")),
      password: String(data.get("password")),
      name: String(data.get("name")),
      phone,
    });
    setPending(false);

    if (result.error) {
      const code = result.error.code ?? "";
      setError(messages[code] ?? result.error.message ?? "Algo salió mal.");
      return;
    }

    // The account's creation already turned the invitation into access.
    router.push(`/eventos/${eventId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 space-y-6">
      <Field label="Tu nombre" required>
        <Input name="name" autoComplete="name" required defaultValue={name} />
      </Field>

      <Field label="Correo electrónico" required>
        <Input type="email" name="email" autoComplete="email" required placeholder="ana@ejemplo.com" />
      </Field>

      <Field label="Tu WhatsApp" help="El número al que llegó la invitación.">
        <Input value={phone} readOnly disabled className="opacity-70" />
      </Field>

      <Field label="Contraseña" help="Mínimo 10 caracteres." required>
        <Input type="password" name="password" autoComplete="new-password" required minLength={10} />
      </Field>

      {error && <p className="text-[0.9rem] text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-5">
        <SubmitButton>{pending ? "Un momento…" : "Crear cuenta y unirme"}</SubmitButton>
        <Link
          href={`/entrar?next=${encodeURIComponent(`/unirse/${token}`)}`}
          className="text-[0.9rem] text-ink-soft hover:text-accent"
        >
          Ya tengo cuenta
        </Link>
      </div>
    </form>
  );
}
