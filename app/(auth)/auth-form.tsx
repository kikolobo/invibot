"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth/client";
import { Field, Input, SubmitButton } from "@/components/ui/field";

/** Better Auth returns English error codes; these are the ones a user can hit. */
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Ese correo o contraseña no coinciden.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese correo.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 10 caracteres.",
};

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const data = new FormData(e.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));

    const result =
      mode === "signup"
        ? await signUp.email({
            email,
            password,
            name: String(data.get("name")),
            phone: String(data.get("phone")),
          })
        : await signIn.email({ email, password });

    setPending(false);

    if (result.error) {
      const code = result.error.code ?? "";
      setError(messages[code] ?? result.error.message ?? "Algo salió mal.");
      return;
    }

    router.push("/eventos");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 space-y-6">
      {mode === "signup" && (
        <Field label="Tu nombre" required>
          <Input name="name" autoComplete="name" required placeholder="Ana Gómez" />
        </Field>
      )}

      <Field label="Correo electrónico" required>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="ana@ejemplo.com"
        />
      </Field>

      {mode === "signup" && (
        <Field
          label="Tu WhatsApp"
          help="Con lada. Si es de México basta con los 10 dígitos."
          required
        >
          <Input
            type="tel"
            name="phone"
            autoComplete="tel"
            inputMode="tel"
            required
            placeholder="55 1234 5678"
          />
        </Field>
      )}

      <Field
        label="Contraseña"
        help={mode === "signup" ? "Mínimo 10 caracteres." : undefined}
        required
      >
        <Input
          type="password"
          name="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={mode === "signup" ? 10 : undefined}
        />
      </Field>

      {error && <p className="text-[0.9rem] text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-5">
        <SubmitButton>
          {pending
            ? "Un momento…"
            : mode === "signup"
              ? "Crear cuenta"
              : "Entrar"}
        </SubmitButton>
        <Link
          href={mode === "signup" ? "/entrar" : "/registro"}
          className="text-[0.9rem] text-ink-soft hover:text-accent"
        >
          {mode === "signup" ? "Ya tengo cuenta" : "Crear una cuenta"}
        </Link>
      </div>
    </form>
  );
}
