import { adjustPayment } from "@/lib/admin/actions";
import { AdminForm, Field } from "./admin-form";

type PaymentForActions = {
  id: string;
  status: string;
  note?: string | null;
  stripeSessionId?: string | null;
  stripeRefundId?: string | null;
  refundedAt?: Date | null;
  canceledAt?: Date | null;
  canceledByName?: string | null;
  method: string | null;
  livemode: boolean;
  slots: number;
  amountMinor: number;
  currency: string;
  stripePaymentIntentId: string | null;
};

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(minor / 100);

/** Which Stripe a payment went through, as a label everybody reads the same way. */
export function ModeBadge({ payment }: { payment: Pick<PaymentForActions, "method" | "livemode"> }) {
  const manual = payment.method === "manual";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[0.72rem] ${
        !manual && payment.livemode ? "border-accent text-accent" : "border-line text-ink-muted"
      }`}
    >
      {manual ? "Manual" : payment.livemode ? "Live" : "Sandbox"}
    </span>
  );
}

/**
 * The "⋯" on a payment's row: refund through Stripe, cancel without moving
 * money, or cancel a pending one. Shared by the payments ledger and each
 * event's page, so both offer exactly the same thing.
 *
 * The refund always runs against the Stripe the payment was made in — its
 * own `livemode`, not whichever mode the admin switch shows today — and the
 * confirmation says which, so a sandbox refund is never mistaken for money.
 */
export function PaymentActions({ payment }: { payment: PaymentForActions }) {
  const active = payment.status === "paid" || payment.status === "pending";
  if (!active) return null;
  const manual = payment.method === "manual";
  const refundable = payment.status === "paid" && !manual && Boolean(payment.stripePaymentIntentId);
  const where = payment.livemode ? "en Live (dinero real)" : "en Sandbox (de prueba)";

  return (
    <details className="group relative">
      <summary
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-lg leading-none text-ink-muted hover:bg-paper-deep hover:text-ink [&::-webkit-details-marker]:hidden"
        aria-label="Acciones del pago"
        title="Acciones"
      >
        ⋯
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-80 space-y-5 rounded-xl border border-line bg-paper p-4 text-left shadow-xl">
        {refundable && (
          <AdminForm
            action={adjustPayment}
            submit="Reembolsar"
            busy="Reembolsando…"
            tone="danger"
            confirm={`Devolver ${money(payment.amountMinor, payment.currency)} por Stripe ${where} y quitar ${payment.slots} lugares.`}
            className="space-y-3"
          >
            <p className="text-[0.85rem] font-medium text-ink">Reembolsar</p>
            <input type="hidden" name="paymentId" value={payment.id} />
            <input type="hidden" name="mode" value="refund" />
            <Field label="Motivo" name="reason" required />
          </AdminForm>
        )}
        <AdminForm
          action={adjustPayment}
          submit={payment.status === "paid" ? "Cancelar sin reembolso" : "Cancelar pago pendiente"}
          busy="Cancelando…"
          tone="quiet"
          confirm={
            payment.status === "paid"
              ? `Quitar ${payment.slots} lugares sin devolver dinero${manual ? " (si hubo, devuélvelo por donde llegó)" : ""}.`
              : "Su ficha de OXXO o liga de pago deja de servir."
          }
          className={`space-y-3 ${refundable ? "border-t border-line pt-4" : ""}`}
        >
          <p className="text-[0.85rem] font-medium text-ink">
            {payment.status === "paid" ? "Cancelar sin reembolso" : "Cancelar"}
          </p>
          <input type="hidden" name="paymentId" value={payment.id} />
          <input type="hidden" name="mode" value="cancel" />
          <Field label="Motivo" name="reason" required />
        </AdminForm>
      </div>
    </details>
  );
}

const when = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

/**
 * Stripe's dashboard for a payment, in the account and mode it was made in.
 * The account id matters: a sandbox is an account of its own, and without it
 * the link opens whichever account the browser last had selected.
 */
const dashboardUrl = (
  payment: Pick<PaymentForActions, "livemode" | "stripePaymentIntentId">,
  accountId: string | null | undefined,
) =>
  payment.stripePaymentIntentId
    ? `https://dashboard.stripe.com/${accountId ? `${accountId}/` : ""}${payment.livemode ? "" : "test/"}payments/${payment.stripePaymentIntentId}`
    : null;

/**
 * A payment's status. Refunded or cancelled, it opens into what support needs
 * to answer for it: who did it and when, why, which Stripe, and the ids to
 * find it there — with a link straight to the payment in Stripe's dashboard.
 */
export function PaymentStatus({
  payment,
  label,
  accounts,
}: {
  payment: PaymentForActions;
  label: string;
  /** Each mode's Stripe account id, from `stripeAccountIds()`. */
  accounts?: { test: string | null; live: string | null };
}) {
  const closed = payment.status === "refunded" || payment.status === "canceled";
  if (!closed) return <span className={payment.status === "paid" ? "text-ink-soft" : "text-ink-muted"}>{label}</span>;

  const manual = payment.method === "manual";
  const at = payment.refundedAt ?? payment.canceledAt;
  const link = manual ? null : dashboardUrl(payment, payment.livemode ? accounts?.live : accounts?.test);
  const ids: [string, string | null | undefined][] = [
    ["Reembolso", payment.stripeRefundId],
    ["Pago", payment.stripePaymentIntentId],
    ["Sesión de checkout", payment.stripeSessionId],
  ];

  return (
    <details className="relative inline-block">
      <summary className="cursor-pointer list-none text-ink-muted underline decoration-dotted underline-offset-4 hover:text-accent [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-80 rounded-xl border border-line bg-paper p-4 text-left text-[0.85rem] shadow-xl">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-ink-muted">{payment.status === "refunded" ? "Reembolsado por" : "Cancelado por"}</dt>
          <dd className="text-ink">
            {payment.canceledByName ?? (payment.status === "refunded" ? "Desde el dashboard de Stripe" : "—")}
          </dd>
          <dt className="text-ink-muted">Cuándo</dt>
          <dd className="text-ink">{at ? when.format(at) : "—"}</dd>
          <dt className="text-ink-muted">Motivo</dt>
          <dd className="text-ink">{payment.note || "—"}</dd>
          <dt className="text-ink-muted">Modo</dt>
          <dd className="text-ink">{manual ? "Manual (fuera de Stripe)" : payment.livemode ? "Live, dinero real" : "Sandbox"}</dd>
          {!manual &&
            ids
              .filter(([, value]) => value)
              .map(([name, value]) => (
                <div key={name} className="contents">
                  <dt className="text-ink-muted">{name}</dt>
                  <dd className="break-all font-mono text-[0.75rem] text-ink">{value}</dd>
                </div>
              ))}
        </dl>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-[0.82rem] text-accent hover:underline"
          >
            Ver en Stripe {payment.livemode ? "(Live)" : "(Sandbox)"} ↗
          </a>
        )}
      </div>
    </details>
  );
}
