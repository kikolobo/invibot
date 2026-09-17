"use client";

import { useEffect, useRef } from "react";

/**
 * Opens the print dialog once the page has settled, and renders nothing.
 *
 * The tab was opened by a button that said "imprimir", so there is nothing left
 * to ask and no button worth showing — anyone who wants it again has Cmd+P. The
 * delay lets the display fonts load; printing mid-swap puts the fallback face
 * on paper.
 */
export function AutoPrint() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // `document.fonts` is missing in a few browsers; the timeout is the floor.
    const ready = document.fonts?.ready ?? Promise.resolve();
    const timer = setTimeout(() => void ready.then(() => window.print()), 350);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
