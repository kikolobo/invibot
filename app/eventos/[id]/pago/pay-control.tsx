"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { CheckoutForm, CheckoutFormProvider, useCheckoutForm } from "@stripe/react-stripe-js/checkout";
import {
  redeemPromo,
  settlePayment,
  startCheckout,
  startEmbeddedCheckout,
  type ReturnTo,
} from "@/lib/billing/actions";
import { CodeForm } from "./code-form";
import type { PaymentOffer } from "@/lib/billing/offer";

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);

/**
 * Buying places, in one line: how many, what that comes to, and Pagar.
 *
 * Used on the payment page and inside "Enviar invitaciones" when places are
 * missing, so both offer the same thing the same way. With a publishable key
 * the payment opens in a window over the page — Stripe's own form, mounted
 * here — and the buyer never leaves Invibot; without one it goes to Stripe's
 * page and back.
 */
export function PayControl({
  eventId,
  offer,
  returnTo = "pago",
  onPaid,
  settling = false,
}: {
  eventId: string;
  offer: PaymentOffer;
  returnTo?: ReturnTo;
  /**
   * When set, a card payment completes without leaving the page: the window
   * closes and this runs — the invite panel uses it to send right away.
   * Without it, Stripe sends the buyer back to `returnTo` as usual.
   */
  onPaid?: () => void;
  /**
   * Back from Stripe with a payment not credited yet. The button stays
   * disabled on "Procesando…" and the page refreshes itself until it lands,
   * so nobody pays twice for the same places.
   */
  settling?: boolean;
}) {
  const router = useRouter();
  // A minute without the payment landing is not worth a button locked for
  // good: it comes back with a note, and the history shows the truth.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!settling) return;
    // Every few seconds for a minute: each refresh asks Stripe again
    // (reconcilePending on the page), and the webhook may land meanwhile.
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 20) {
        clearInterval(timer);
        setGaveUp(true);
      } else router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [settling, router]);
  const [slots, setSlots] = useState(offer.defaultSlots);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<{ clientSecret: string; paymentId: string } | null>(null);
  // The window opens on the click, before Stripe has answered: a second of
  // "preparing" inside it reads as fast, the same second on a dead button
  // reads as broken.
  const [windowOpen, setWindowOpen] = useState(false);
  const [pending, start] = useTransition();
  // Closed while Stripe was still answering: the answer is ignored. Nothing is
  // cancelled at Stripe — an unpaid session expires on its own within a day,
  // and expiring it from here once cut a payment off mid-confirmation.
  const abandoned = useRef(false);

  // The open checkout survives the page being redrawn underneath it. The
  // first server call after a load can renew the session cookie, and Next
  // redraws the page when an action sets one — which used to drop the window
  // the moment it opened. Per tab, forgotten on close, on payment, or after
  // half an hour.
  const storageKey = `invibot-checkout-${eventId}`;
  useEffect(() => {
    // Read after the first paint, never during render: the server drew this
    // with the window shut, and the first client render must match it.
    const frame = requestAnimationFrame(() => {
      try {
        if (new URLSearchParams(window.location.search).get("pago") === "listo") {
          sessionStorage.removeItem(storageKey);
          return;
        }
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as
          | { clientSecret: string; paymentId: string; at: number }
          | null;
        if (saved && Date.now() - saved.at < 30 * 60 * 1000) {
          setCheckout({ clientSecret: saved.clientSecret, paymentId: saved.paymentId });
          setWindowOpen(true);
        } else if (saved) {
          sessionStorage.removeItem(storageKey);
        }
      } catch {
        // Storage blocked or unreadable: the window simply does not come back.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);

  const remember = (value: { clientSecret: string; paymentId: string } | null) => {
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify({ ...value, at: Date.now() }));
      else sessionStorage.removeItem(storageKey);
    } catch {
      // Not essential; see above.
    }
  };

  // "Usar código", folded beside Pagar until somebody has one.
  const [codeOpen, setCodeOpen] = useState(false);
  const codeArea = codeOpen && (
    <CodeForm
      action={redeemPromo.bind(null, eventId)}
      // Places added: sending carries on where there is a send waiting,
      // otherwise the page redraws with the new count.
      onRedeemed={() => (onPaid ? onPaid() : router.refresh())}
    />
  );
  const codeButton = (
    <button
      type="button"
      onClick={() => setCodeOpen((open) => !open)}
      aria-expanded={codeOpen}
      className="text-[0.9rem] text-ink-soft underline decoration-dotted underline-offset-4 hover:text-accent"
    >
      Usar código
    </button>
  );

  const billed = Math.max(slots || 0, offer.minimumSlots);
  const busy = pending || windowOpen || (settling && !gaveUp);
  // Loaded once per key, from js.stripe.com as Stripe requires.
  const stripe = useMemo(() => (offer.publishableKey ? loadStripe(offer.publishableKey) : null), [offer.publishableKey]);

  if (!offer.configured) {
    // No payments yet, but a courtesy code still works.
    return (
      <div>
        <p className="text-[0.9rem] text-ink-muted">
          Los pagos todavía no están activos. Escríbenos y te ayudamos. {codeButton}
        </p>
        {codeArea}
      </div>
    );
  }

  function pay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!stripe) {
      // No publishable key: Stripe's own page, and back.
      const form = new FormData();
      form.set("slots", String(billed));
      form.set("returnTo", returnTo);
      start(async () => {
        const result = await startCheckout(eventId, {}, form);
        if (result?.error) setError(result.error);
      });
      return;
    }
    setWindowOpen(true);
    abandoned.current = false;
    start(async () => {
      const result = await startEmbeddedCheckout(eventId, billed, returnTo);
      if (abandoned.current) return;
      if (result.error || !result.clientSecret || !result.paymentId) {
        setWindowOpen(false);
        setError(result.error ?? "No pudimos abrir el pago.");
      } else {
        const opened = { clientSecret: result.clientSecret, paymentId: result.paymentId };
        setCheckout(opened);
        remember(opened);
      }
    });
  }

  function close() {
    if (!checkout) abandoned.current = true;
    remember(null);
    setCheckout(null);
    setWindowOpen(false);
  }

  return (
    <>
      <form onSubmit={pay}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <input
              aria-label="Lugares"
              type="number"
              min={1}
              max={5000}
              inputMode="numeric"
              value={slots || ""}
              disabled={busy}
              onChange={(event) => setSlots(Number(event.target.value))}
              className="w-24 rounded-lg border border-line bg-paper px-3 py-2.5 text-ink tabular-nums"
            />
            <span className="text-[0.9rem] text-ink-soft">lugares</span>
          </label>
          <span className="font-display text-2xl tabular-nums text-ink">{money(billed * offer.unitAmountMinor, offer.currency)}</span>
          <button
            type="submit"
            // Anything in flight — opening, the window up, the payment being
            // recorded, or a payment back from Stripe not credited yet — and
            // the button says so and cannot be pressed again.
            disabled={busy}
            className="rounded-full bg-action px-8 py-2.5 text-[0.95rem] text-ink-onaction disabled:opacity-50"
          >
            {busy ? "Procesando…" : "Pagar"}
          </button>
          {codeButton}
        </div>
        <p className="mt-2 text-[0.8rem] text-ink-muted">Disponible con: tarjeta, OXXO o transferencia. IVA incluido.</p>
        {slots < offer.minimumSlots && (
          // Its own line, in yellow: the total above already moved to the
          // minimum, and the buyer should see why before pressing Pagar.
          <p className="mt-2 text-[0.88rem] text-gold" role="status">
            La compra mínima es de {offer.minimumSlots} lugares; se cobrarán {offer.minimumSlots} y los que sobren se
            quedan en tu evento.
          </p>
        )}
        {settling && !gaveUp && (
          <p className="mt-2 text-[0.85rem] text-ink-soft" role="status">
            Estamos registrando tu pago; esto toma unos segundos.
          </p>
        )}
        {settling && gaveUp && (
          <p className="mt-2 text-[0.85rem] text-ink-muted">
            Tu pago aún no aparece. Si ya se cobró, se acreditará solo en unos minutos; no hace falta pagar otra vez.
          </p>
        )}
        {error && <p className="mt-2 text-[0.88rem] text-danger">{error}</p>}
      </form>
      {codeArea}

      {windowOpen && stripe && (
        <PaymentWindow onClose={close}>
          {checkout ? (
            <CheckoutFormProvider stripe={stripe} options={{ clientSecret: checkout.clientSecret }}>
              <ConfirmingForm
                stayOnPage={Boolean(onPaid)}
                onConfirmed={async () => {
                  const result = await settlePayment(eventId, checkout.paymentId);
                  if (result.paid) {
                    remember(null);
                    setCheckout(null);
                    setWindowOpen(false);
                    onPaid?.();
                    return null;
                  }
                  return result.waiting
                    ? "Listo: en cuanto el banco confirme tu pago se acreditan los lugares y podrás enviar las invitaciones."
                    : "Recibimos tu pago; se está acreditando. En un momento podrás enviar.";
                }}
              />
            </CheckoutFormProvider>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-neutral-500" role="status">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-500" />
              <span className="text-[0.9rem]">Preparando el pago…</span>
            </div>
          )}
        </PaymentWindow>
      )}
    </>
  );
}

/**
 * Stripe's form, with the one step it leaves to us: when the buyer presses
 * pay, the form raises `confirm` and waits for the page to confirm the
 * session. Without this it greys out and sits there, and nothing reaches
 * Stripe. On success Stripe sends the buyer to the session's `return_url`,
 * which is back on Invibot. Errors in the card itself the form shows on its
 * own; this only has to report the ones that stop confirmation outright.
 */
function ConfirmingForm({
  stayOnPage,
  onConfirmed,
}: {
  /** Confirm without redirecting when the method allows it (cards do). */
  stayOnPage: boolean;
  /** After a successful confirm on the page; returns a note to show, or null when done. */
  onConfirmed: () => Promise<string | null>;
}) {
  const state = useCheckoutForm();
  const [failure, setFailure] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Between Stripe saying yes and the window closing: our side records the
  // payment, which takes a moment and must not look like nothing happening.
  const [processing, setProcessing] = useState(false);

  if (state.type === "error") {
    return <p className="py-10 text-center text-[0.9rem] text-red-700">No se pudo cargar el pago: {state.error.message}</p>;
  }

  return (
    <div className="relative">
      {processing && (
        <div
          role="status"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-xl bg-white/95 text-neutral-600"
        >
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
          <span className="text-[0.95rem]">Procesando tu pago…</span>
        </div>
      )}
      <CheckoutForm
        onConfirm={async (event) => {
          if (state.type !== "success") return;
          setFailure(null);
          try {
            const result = await state.checkout.confirm({
              formConfirmEvent: event,
              redirect: stayOnPage ? "if_required" : "always",
            });
            // Errors in the card itself the form already shows; success is ours.
            if (result.type === "success" && stayOnPage) {
              setProcessing(true);
              const message = await onConfirmed();
              setProcessing(false);
              setNote(message);
            }
          } catch (error) {
            console.error("[pago] confirm failed", error);
            setFailure("No se pudo completar el pago. Revisa los datos e inténtalo otra vez.");
          }
        }}
      />
      {failure && <p className="mt-3 text-center text-[0.88rem] text-red-700">{failure}</p>}
      {note && <p className="mt-3 text-center text-[0.88rem] text-neutral-700">{note}</p>}
    </div>
  );
}

/**
 * A window drawn over the page: dimmed backdrop, a panel that scrolls on its
 * own, Escape or the × to close. Closing cancels nothing at Stripe; an unpaid
 * session expires there on its own.
 *
 * Not a click on the backdrop. The backdrop appears under the cursor the
 * moment Pagar is pressed, so the second click of a double-click — or a
 * trackpad's double tap — landed on it and closed the window as it opened.
 * A payment half filled in should not be one stray click from gone.
 */
function PaymentWindow({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeRef.current();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 px-4 py-6 sm:py-12"
      role="dialog"
      aria-modal="true"
      aria-label="Pago"
    >
      <div className="relative w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[0.85rem] text-neutral-500">Pago seguro con Stripe</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full px-3 py-1 text-xl leading-none text-neutral-500 hover:bg-neutral-100"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
