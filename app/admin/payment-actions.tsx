import { adjustPayment } from "@/lib/admin/actions";
import { AdminForm, Field } from "./admin-form";

type PaymentForActions = {
  id: string;
  status: string;
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
