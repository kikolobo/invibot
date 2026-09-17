"use client";

import { useEffect, useRef } from "react";

/**
 * Opens the print dialog once the page has settled.
 *
 * The tab was opened by a button that said "imprimir", so waiting for a second
 * click would be theatre. The delay lets the display fonts load — printing
 * mid-swap puts the fallback face on paper.
 */
export function AutoPrint() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const go = () => window.print();
    // `document.fonts` is unavailable in a few browsers; the timeout is the
    // floor, not an optimisation.
    const ready = document.fonts?.ready ?? Promise.resolve();
    const timer = setTimeout(() => void ready.then(go), 350);
    return () => clearTimeout(timer);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-hide mb-8 rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper"
    >
      Imprimir de nuevo
    </button>
  );
}
