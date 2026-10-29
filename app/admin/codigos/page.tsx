import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { createPromoCode, setPromoActive } from "@/lib/admin/actions";
import { listPromoCodes, promoStateLabels, promoStateOf } from "@/lib/admin/promo";
import { AdminForm, Field } from "../admin-form";
import { formatDate } from "../format";
import { Panel, formatNumber } from "../ui";

export const metadata = { title: "Códigos" };

/**
 * Courtesy codes: places for the first N accounts that type one in on an
 * event's payment page. For launch announcements, and for trying the paid
 * flow end to end before Stripe is switched on.
 */
export default async function Codigos() {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const codes = await listPromoCodes();

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-12 sm:px-10">
      <div>
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Códigos de cortesía</h1>
        <p className="mt-3 max-w-xl text-ink-soft">
          Cada cuenta puede usar un código una vez, en el evento que elija. Los lugares se suman como regalo y
          el código se cierra solo cuando lo usa el último usuario permitido.
        </p>
      </div>

      {isAdmin && (
        <Panel title="Nuevo código">
          <AdminForm action={createPromoCode} submit="Crear código" className="space-y-4">
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <Field
                label="Código"
                name="code"
                autoComplete="off"
                placeholder="Vacío para generar uno"
                hint="Letras, números o guiones. Sin importar mayúsculas."
              />
              <Field label="Nota" name="note" placeholder="Lanzamiento en Instagram" />
              <Field label="Usuarios" name="maxRedemptions" type="number" min={1} required defaultValue={10} />
              <Field label="Invitados por usuario" name="slotsPerUser" type="number" min={1} required defaultValue={50} />
              <Field label="Vence (opcional)" name="expiresAt" type="date" hint="Vale hasta el final de ese día." />
            </div>
          </AdminForm>
        </Panel>
      )}

      <Panel title={`Códigos (${codes.length})`}>
        {codes.length === 0 ? (
          <p className="text-[0.9rem] text-ink-muted">Todavía no hay ninguno.</p>
        ) : (
          <ul className="space-y-4">
            {codes.map((promo) => {
              const state = promoStateOf(promo);
              return (
                <li key={promo.id} className="rounded-xl border border-line p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <code className="font-display text-2xl tracking-wider text-ink">{promo.code}</code>
                      <span
                        className={`ml-3 rounded-full border px-3 py-0.5 text-[0.78rem] ${
                          state === "active" ? "border-accent text-accent" : "border-line text-ink-muted"
                        }`}
                      >
                        {promoStateLabels[state]}
                      </span>
                      <p className="mt-1 text-[0.88rem] text-ink-soft">
                        {formatNumber(promo.redeemedCount)} de {formatNumber(promo.maxRedemptions)} usuarios ·{" "}
                        {formatNumber(promo.slotsPerUser)} invitados cada uno
                        {promo.expiresAt && ` · vence ${formatDate(promo.expiresAt)}`}
                        {promo.note && ` · ${promo.note}`}
                      </p>
                    </div>
                    {isAdmin && (
                      <AdminForm
                        action={setPromoActive}
                        submit={promo.active ? "Desactivar" : "Activar"}
                        tone="quiet"
                        className="flex items-center gap-3"
                      >
                        <input type="hidden" name="codeId" value={promo.id} />
                        <input type="hidden" name="active" value={promo.active ? "false" : "true"} />
                      </AdminForm>
                    )}
                  </div>
                  {promo.uses.length > 0 && (
                    <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[0.85rem]">
                      {promo.uses.map((use) => (
                        <li key={use.id} className="text-ink-soft">
                          <Link href={`/admin/usuarios/${use.userId}`} className="text-ink hover:text-accent">
                            {use.userName || use.userEmail}
                          </Link>
                          {use.eventId && (
                            <>
                              {" en "}
                              <Link href={`/admin/eventos/${use.eventId}`} className="hover:text-accent">
                                «{use.eventName}»
                              </Link>
                            </>
                          )}{" "}
                          · {formatDate(use.createdAt)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
