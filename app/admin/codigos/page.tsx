import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { setPromoActive } from "@/lib/admin/actions";
import { listPromoCodes, promoStateLabels, promoStateOf } from "@/lib/admin/promo";
import { AdminForm } from "../admin-form";
import { formatDate } from "../format";
import { formatNumber } from "../ui";

export const metadata = { title: "Códigos" };

/**
 * Courtesy codes: places for the first N accounts that type one in on an
 * event's payment page. The list first — what exists, how used, suspend one
 * in place — and making a new one on a page of its own.
 */
export default async function Codigos({ searchParams }: { searchParams: Promise<{ creado?: string }> }) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const { creado } = await searchParams;
  const codes = await listPromoCodes();

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-ink sm:text-5xl">Códigos de cortesía</h1>
          <p className="mt-3 max-w-xl text-ink-soft">
            {codes.length === 1 ? "Un código" : `${formatNumber(codes.length)} códigos`}. Cada cuenta puede usar un
            código una vez; los lugares se suman como regalo al evento donde lo usa.
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/admin/codigos/nuevo"
            className="rounded-full bg-action px-5 py-2 text-[0.9rem] text-ink-onaction"
          >
            Nuevo código
          </Link>
        )}
      </div>

      {creado && (
        <p className="mt-6 rounded-xl border border-line bg-paper-deep px-5 py-3 text-[0.9rem] text-ink">
          Código <code className="tracking-wider">{creado}</code> creado.
        </p>
      )}

      {codes.length === 0 ? (
        <p className="mt-10 text-[0.9rem] text-ink-muted">Todavía no hay ninguno.</p>
      ) : (
        <ul className="mt-10 divide-y divide-line rounded-xl border border-line">
          {codes.map((promo) => {
            const state = promoStateOf(promo);
            const usage = promo.maxRedemptions ? Math.min(1, promo.redeemedCount / promo.maxRedemptions) : 0;
            return (
              <li key={promo.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="min-w-48 flex-1">
                    <div className="flex items-center gap-3">
                      <code className="font-display text-xl tracking-wider text-ink">{promo.code}</code>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[0.75rem] ${
                          state === "active" ? "border-accent text-accent" : "border-line text-ink-muted"
                        }`}
                      >
                        {promoStateLabels[state]}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.82rem] text-ink-muted">
                      {formatNumber(promo.slotsPerUser)} invitados por usuario
                      {promo.expiresAt && ` · vence ${formatDate(promo.expiresAt)}`}
                      {promo.note && ` · ${promo.note}`}
                    </p>
                  </div>

                  {/* How full it is, as a count and a bar. */}
                  <div className="w-40">
                    <p className="text-right text-[0.85rem] tabular-nums text-ink-soft">
                      {formatNumber(promo.redeemedCount)} / {formatNumber(promo.maxRedemptions)} usuarios
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-deep">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${usage * 100}%` }} />
                    </div>
                  </div>

                  {isAdmin && (
                    <AdminForm
                      action={setPromoActive}
                      submit={promo.active ? "Suspender" : "Reactivar"}
                      busy={promo.active ? "Suspendiendo…" : "Reactivando…"}
                      tone={promo.active ? "quiet" : "default"}
                      className="flex w-32 flex-col items-end gap-1 text-right"
                    >
                      <input type="hidden" name="codeId" value={promo.id} />
                      <input type="hidden" name="active" value={promo.active ? "false" : "true"} />
                    </AdminForm>
                  )}
                </div>

                {promo.uses.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[0.82rem] text-ink-muted hover:text-accent">
                      Quién lo usó ({promo.uses.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-[0.85rem]">
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
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
