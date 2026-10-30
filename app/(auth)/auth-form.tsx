"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth/client";
import { Field, Input, SubmitButton } from "@/components/ui/field";
import { checkSignupPromo, claimSignupPromo, type PromoCheck } from "./registro/promo";

/** Better Auth returns English error codes; these are the ones a user can hit. */
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Ese correo o contraseña no coinciden.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese correo.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 10 caracteres.",
};

export function AuthForm({
  mode,
  next = "/eventos",
}: {
  mode: "signin" | "signup";
  /** Where to land afterwards; an invitation link sends people back to itself. */
  next?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // A courtesy code, offered folded away under the password at signup.
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promo, setPromo] = useState<PromoCheck | null>(null);
  const [checking, setChecking] = useState(false);
  // The account exists but the code could not be set aside: say so, and let
  // them carry on rather than leaving them on a form that already worked.
  const [claimFailed, setClaimFailed] = useState<string | null>(null);

  async function validatePromo(): Promise<PromoCheck | null> {
    const code = promoCode.trim();
    if (!code) {
      setPromo(null);
      return null;
    }
    setChecking(true);
    const result = await checkSignupPromo(code);
    setChecking(false);
    setPromo(result);
    return result;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // A typed code is checked before the account is made, so a mistyped one
    // can be fixed on the spot instead of discovered later.
    const wantsPromo = mode === "signup" && promoOpen && promoCode.trim() !== "";
    if (wantsPromo && !promo?.ok) {
      const checked = await validatePromo();
      if (!checked?.ok) return;
    }

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

    if (result.error) {
      setPending(false);
      const code = result.error.code ?? "";
      setError(messages[code] ?? result.error.message ?? "Algo salió mal.");
      return;
    }

    // Set aside now that the account exists; its places go to the first event.
    if (wantsPromo) {
      const claimed = await claimSignupPromo(promoCode);
      if (!claimed.ok) {
        setPending(false);
        setClaimFailed(claimed.error);
        return;
      }
    }

    router.push(next);
    router.refresh();
  }

  if (claimFailed) {
    return (
      <div className="mt-10 space-y-4">
        <p className="text-ink">¡Tu cuenta está lista!</p>
        <p className="text-[0.9rem] text-ink-soft">
          {claimFailed} Puedes usarlo después en la sección «Pagos» de tu evento.
        </p>
        <button
          type="button"
          onClick={() => {
            router.push(next);
            router.refresh();
          }}
          className="rounded-full bg-action px-6 py-2.5 text-[0.9rem] text-ink-onaction"
        >
          Continuar
        </button>
      </div>
    );
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

      {mode === "signup" &&
        (promoOpen ? (
          <Field label="Código de promoción" help="Te da lugares de regalo para tu primer evento.">
            <div className="flex gap-2">
              <Input
                name="promo"
                autoComplete="off"
                autoCapitalize="characters"
                value={promoCode}
                onChange={(event) => {
                  setPromoCode(event.target.value);
                  setPromo(null);
                }}
                placeholder="CÓDIGO"
                className="uppercase tracking-wider"
              />
              <button
                type="button"
                onClick={() => void validatePromo()}
                disabled={checking || !promoCode.trim()}
                className="shrink-0 rounded-full border border-line px-4 text-[0.88rem] text-ink-soft transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {checking ? "Revisando…" : "Validar"}
              </button>
            </div>
            {promo?.ok && (
              <p className="text-[0.88rem] text-accent">
                ✓ Código válido: {promo.slots} invitados de regalo en tu primer evento.
              </p>
            )}
            {promo && !promo.ok && <p className="text-[0.88rem] text-danger">{promo.error}</p>}
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setPromoOpen(true)}
            className="text-[0.9rem] text-ink-soft underline decoration-dotted underline-offset-4 hover:text-accent"
          >
            ¿Tienes un código de promoción?
          </button>
        ))}

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
