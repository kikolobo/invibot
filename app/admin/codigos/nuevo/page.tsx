import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { createPromoCode } from "@/lib/admin/actions";
import { AdminForm, Field } from "../../admin-form";

export const metadata = { title: "Nuevo código" };

/** Making a courtesy code: how many accounts, how many guests each, until when. */
export default async function NuevoCodigo() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
      <Link href="/admin/codigos" className="text-[0.88rem] text-ink-muted hover:text-accent">
        ← Códigos
      </Link>
      <h1 className="mt-4 font-display text-4xl text-ink">Nuevo código</h1>
      <p className="mt-3 max-w-md text-[0.9rem] leading-relaxed text-ink-muted">
        Cada cuenta lo puede usar una vez, en el evento que elija. Se cierra solo cuando lo usa el último usuario
        permitido, o cuando vence.
      </p>

      <AdminForm action={createPromoCode} submit="Crear código" busy="Creando…" className="mt-10 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Código"
            name="code"
            autoComplete="off"
            placeholder="Vacío para generar uno"
            hint="Letras, números o guiones. Sin importar mayúsculas."
          />
          <Field label="Nota" name="note" placeholder="Lanzamiento en Instagram" hint="Dónde se anunció." />
          <Field label="Usuarios" name="maxRedemptions" type="number" min={1} required defaultValue={10} />
          <Field label="Invitados por usuario" name="slotsPerUser" type="number" min={1} required defaultValue={50} />
          <Field label="Vence (opcional)" name="expiresAt" type="date" hint="Vale hasta el final de ese día." />
        </div>
      </AdminForm>
    </div>
  );
}
