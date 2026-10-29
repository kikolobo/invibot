import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { createUser } from "@/lib/admin/actions";
import { PLATFORM_ROLES, roleLabels } from "@/lib/auth/permissions";
import { AdminForm, Field } from "../../admin-form";

export const metadata = { title: "Nueva cuenta" };

/**
 * An account made by staff, past the signup passcode. It gets its organization
 * the first time it signs in, like any other.
 */
export default async function NuevaCuenta() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
      <Link href="/admin/usuarios" className="text-[0.88rem] text-ink-muted hover:text-accent">
        ← Cuentas
      </Link>
      <h1 className="mt-4 font-display text-4xl text-ink">Nueva cuenta</h1>
      <p className="mt-3 max-w-md text-[0.9rem] leading-relaxed text-ink-muted">
        Entra con el correo y la contraseña que pongas aquí. Pásaselos por un canal privado y pídele
        que cambie la contraseña en «Mi cuenta».
      </p>

      <AdminForm action={createUser} submit="Crear cuenta" busy="Creando…" className="mt-10 max-w-sm space-y-4">
        <Field label="Nombre" name="name" required autoComplete="off" />
        <Field label="Correo" name="email" type="email" required autoComplete="off" />
        <Field
          label="WhatsApp"
          name="phone"
          type="tel"
          inputMode="tel"
          required
          placeholder="55 1234 5678"
          hint="Una cuenta por número: es como la encuentran las invitaciones."
        />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
        />
        <label className="block">
          <span className="text-[0.9rem] text-ink-soft">Rol</span>
          <select
            name="role"
            defaultValue="user"
            className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink"
          >
            {PLATFORM_ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </label>
      </AdminForm>
    </div>
  );
}
