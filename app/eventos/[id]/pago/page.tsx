import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { requireEventAccess } from "@/lib/events/access";
import { slotStatus, quote } from "@/lib/billing/slots";
import { redeemPromo, startCheckout } from "@/lib/billing/actions";
import { stripeFromEnv } from "@/lib/billing/stripe";
import { getSettings } from "@/lib/site/settings";
import { BuyForm } from "./buy-form";
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
} as const;

const methodText: Record<string, string> = {
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
  searchParams: Promise<{ estado?: string; lugares?: string }>;
}) {
  const { id } = await params;
  const { estado, lugares } = await searchParams;
  await requireEventAccess(id, "event");

  const [status, settings, history] = await Promise.all([
    slotStatus(id),
    getSettings(),
    db.select().from(payments).where(eq(payments.eventId, id)).orderBy(desc(payments.createdAt)).limit(20),
  ]);
  if (!status) return null;

  const needed = Math.max(Number(lugares) || 0, status.waiting - status.available, 0);
  const sample = quote(1, settings);
  const pending = history.filter((payment) => payment.status === "pending" && payment.stripeSessionId);
  const configured = stripeFromEnv() !== null;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl text-ink">Pagos</h1>
      <p className="mt-3 max-w-lg leading-relaxed text-ink-soft">
        Armar tu evento es gratis. Lo que se paga es hablar con tus invitados por WhatsApp:{" "}
        {money(settings.pricePerGuestMinor, settings.currency)} por invitado, una sola vez, e incluye su invitación,
        su confirmación, los recordatorios, su pase y todo lo que le pregunte al asistente.
      </p>

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
            {configured ? (
              <BuyForm
                action={startCheckout.bind(null, id)}
                suggested={needed}
                unitAmountMinor={sample.unitAmountMinor}
                minimumSlots={settings.minimumSlots}
                currency={settings.currency}
              />
            ) : (
              <p className="mt-4 text-[0.9rem] text-ink-muted">
                Los pagos todavía no están activos. Escríbenos y te ayudamos.
              </p>
            )}
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
