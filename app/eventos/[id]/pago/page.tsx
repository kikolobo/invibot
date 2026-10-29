import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { requireEventAccess } from "@/lib/events/access";
import { slotStatus } from "@/lib/billing/slots";
import { paymentOffer } from "@/lib/billing/offer";
import { redeemPromo } from "@/lib/billing/actions";
import { reconcilePending } from "@/lib/billing/credit";
import { getSettings } from "@/lib/site/settings";
import { included, methods, priceLabels } from "@/lib/billing/pricing";
import { PayControl } from "./pay-control";
import { CodeForm } from "./code-form";

export const metadata = { title: "Pagos" };

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(minor / 100);

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

const statusText = {
  pending: "Esperando el pago",
  paid: "Pagado",
  failed: "No se completó",
  expired: "Venció",
  refunded: "Reembolsado",
  canceled: "Cancelado",
} as const;

const methodText: Record<string, string> = {
  manual: "Registrado por Invibot",
  card: "Tarjeta",
  oxxo: "OXXO",
  customer_balance: "Transferencia SPEI",
};

/**
 * What the event has paid for, what it is using, and the way to buy more.
 * Everything else in Invibot is free; this page is the one place money shows.
 */
export default async function Pago({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pago?: string; lugares?: string }>;
}) {
  const { id } = await params;
  const { pago: estado, lugares } = await searchParams;
  await requireEventAccess(id, "event");
  // Before reading anything: a payment that settled while the webhook was
  // away should already count on this page.
  await reconcilePending(id);

  const [status, settings, history] = await Promise.all([
    slotStatus(id),
    getSettings(),
    // Only what happened: paid, or really waiting on OXXO/SPEI (which is what
    // a recorded method on a pending payment means). Abandoned attempts are
    // staff's business, in /admin/pagos.
    db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.eventId, id),
          or(
            eq(payments.status, "paid"),
            // A refund or cancellation took places back; the organizer should see why.
            eq(payments.status, "refunded"),
            eq(payments.status, "canceled"),
            and(eq(payments.status, "pending"), isNotNull(payments.method)),
          ),
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(20),
  ]);
  if (!status) return null;

  // Starts at 20, or at every guest still without a place when that is more.
  const needed = Math.max(Number(lugares) || 0, status.waiting - status.available, 0);
  const offer = await paymentOffer(id, needed);
  const labels = priceLabels(settings);
  const pending = history.filter((payment) => payment.status === "pending");
  // Back from Stripe and the money is not in yet: the latest checkout, from
  // the last half hour, still pending and not an OXXO/SPEI wait (those carry
  // a method). Only the latest — an older abandoned attempt must not hold the
  // button.
  const [latest] =
    estado === "listo"
      ? await db
          .select({
            status: payments.status,
            method: payments.method,
            // Postgres's clock, not the render's: a page must not ask the time.
            recent: sql<boolean>`${payments.createdAt} > now() - interval '30 minutes'`,
          })
          .from(payments)
          .where(eq(payments.eventId, id))
          .orderBy(desc(payments.createdAt))
          .limit(1)
      : [];
  const settling = Boolean(
    latest &&
      latest.status === "pending" &&
      latest.method === null &&
      latest.recent,
  );

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl text-ink">Pagos</h1>

      {/* The price first, as the thing it is: one number, what it buys, and
          that building the event costs nothing. */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-paper-deep">
        <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-10 sm:p-8">
          <div>
            <p className="eyebrow">Por invitado</p>
            <p className="mt-2 font-display text-6xl leading-none tracking-tight text-ink sm:text-7xl">
              {labels.perGuest}
            </p>
            <p className="mt-2 text-[0.85rem] text-ink-muted">
              {labels.currency} · IVA incluido · un solo pago
            </p>
          </div>
          <ul className="space-y-1.5 text-[0.92rem] text-ink-soft">
            {included.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="text-accent">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="border-t border-line px-6 py-3 text-[0.85rem] text-ink-muted sm:px-8">
          Armar tu evento es gratis. Pagas sólo por los invitados a los que les escribimos: una boda de{" "}
          {labels.example.guests} invitados son {labels.example.total}. {methods}.
        </p>
      </div>

      {estado === "listo" && (
        <p className="mt-6 rounded-xl border border-line bg-paper-deep px-5 py-4 text-[0.9rem] text-ink">
          ¡Gracias! Con tarjeta los lugares quedan al momento. Si pagaste en OXXO o por transferencia, se
          acreditan en cuanto el banco nos avise, normalmente en unas horas.
        </p>
      )}
      {estado === "cancelado" && (
        <p className="mt-6 text-[0.9rem] text-ink-muted">No se hizo ningún cargo.</p>
      )}

      {status.exempt ? (
        <p className="mt-8 rounded-xl border border-line bg-paper-deep px-5 py-4 text-ink">
          Tu cuenta es de cortesía: puedes invitar sin pagar.
        </p>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Pagados", status.paid],
              ["De regalo", status.gifted],
              ["Usados", status.used],
              ["Disponibles", status.available],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line bg-paper-deep px-4 py-3">
                <dt className="text-[0.75rem] uppercase tracking-wide text-ink-muted">{label}</dt>
                <dd className="mt-1 font-display text-3xl tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[0.9rem] text-ink-soft">
            {status.waiting === 0
              ? "Todos tus invitados aprobados ya tienen lugar."
              : status.waiting <= status.available
                ? `Tienes ${status.waiting} invitados por invitar y te alcanzan los lugares.`
                : `Tienes ${status.waiting} invitados por invitar: te faltan ${status.waiting - status.available} lugares.`}{" "}
            Un invitado ocupa su lugar la primera vez que le escribimos, y lo conserva aunque lo quites de la lista.
          </p>

          <section className="mt-10 border-t border-line pt-8">
            <h2 className="font-display text-2xl text-ink">¿Tienes un código de cortesía?</h2>
            <p className="mt-2 max-w-md text-[0.9rem] text-ink-muted">
              Se suma a este evento como lugares de regalo. Cada cuenta puede usar un código una sola vez.
            </p>
            <CodeForm action={redeemPromo.bind(null, id)} />
          </section>

          <section className="mt-10 border-t border-line pt-8">
            <h2 className="font-display text-2xl text-ink">Comprar lugares</h2>
            <div className="mt-6">
              <PayControl eventId={id} offer={offer} settling={settling} />
            </div>
          </section>
        </>
      )}

      {history.length > 0 && (
        <section className="mt-10 border-t border-line pt-8">
          <h2 className="font-display text-2xl text-ink">Historial</h2>
          {pending.length > 0 && (
            <p className="mt-2 text-[0.85rem] text-ink-muted">
              Un pago en OXXO o por transferencia se queda «esperando» hasta que el banco lo confirma.
            </p>
          )}
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
            {history.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-[0.9rem]">
                <span className="text-ink">
                  {payment.slots} lugares · {money(payment.amountMinor, payment.currency)}
                  <span className="block text-[0.8rem] text-ink-muted">
                    {dateFmt.format(payment.paidAt ?? payment.createdAt)}
                    {payment.method && ` · ${methodText[payment.method] ?? payment.method}`}
                  </span>
                </span>
                <span className={payment.status === "paid" ? "text-ink-soft" : "text-ink-muted"}>
                  {statusText[payment.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
