import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { ChangePassword } from "./change-password";
import { ChangePhone } from "./change-phone";

export const metadata = { title: "Mi cuenta" };

/** Must match `emailAndPassword.minPasswordLength` in the auth config. */
const MIN_PASSWORD = 10;

export default async function Cuenta() {
  const { email, name, userId } = await requireOrg();
  const account = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { phone: true },
  });
  const phone = account?.phone ?? null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Mi cuenta</h1>
      <p className="mt-3 text-ink-soft">{name ? `${name} · ${email}` : email}</p>

      <section className="mt-12 border-t border-line pt-10">
        <h2 className="font-display text-2xl text-ink">Tu WhatsApp</h2>
        <p className="mt-2 max-w-md text-[0.9rem] leading-relaxed text-ink-muted">
          {phone
            ? `Hoy es ${formatPhone(phone)}. `
            : "Todavía no tienes un número registrado. "}
          Es el número por el que te encuentran cuando te invitan a un evento, y donde te llegan
          las preguntas de los invitados. Si lo cambias, cambia en todos tus eventos.
        </p>
        <ChangePhone current={phone ? formatPhone(phone) : null} />
      </section>

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
