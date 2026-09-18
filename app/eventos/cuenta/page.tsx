import { requireOrg } from "@/lib/auth/session";
import { ChangePassword } from "./change-password";

export const metadata = { title: "Mi cuenta" };

/** Must match `emailAndPassword.minPasswordLength` in the auth config. */
const MIN_PASSWORD = 10;

export default async function Cuenta() {
  const { email, name } = await requireOrg();

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Mi cuenta</h1>
      <p className="mt-3 text-ink-soft">{name ? `${name} · ${email}` : email}</p>

      <section className="mt-12 border-t border-line pt-10">
        <h2 className="font-display text-2xl text-ink">Cambiar contraseña</h2>
        <p className="mt-2 max-w-md text-[0.9rem] leading-relaxed text-ink-muted">
          Esta cuenta puede ver los teléfonos de tus invitados y mandar mensajes de WhatsApp
          que se cobran. Vale la pena una contraseña que no uses en ningún otro lado.
        </p>
        <ChangePassword minLength={MIN_PASSWORD} />
      </section>
    </div>
  );
}
