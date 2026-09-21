"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Something that sits over the page and takes the whole attention.
 *
 * Not a browser popup — those are blocked, and a second window is the wrong
 * shape for editing one row of a table anyway. This is the page's own element,
 * over the list, with the list still visible behind it so closing it returns
 * the organizer to where they were.
 *
 * Shared by the edit form and the history panel so that both close the same
 * way: the button, Escape, or the darkened area around them. A dialog that
 * closes differently from the one next to it is a dialog people stop trusting.
 */
export function Overlay({
  onClose,
  align = "center",
  title,
  subtitle,
  children,
}: {
  onClose: () => void;
  /** Centred for a form, against the right edge for a long panel. */
  align?: "center" | "right";
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // The page behind must not scroll under the overlay: on a phone that is how
    // you close a dialog by accident and lose what you typed.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const centred = align === "center";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`fixed inset-0 z-50 flex ${centred ? "items-center justify-center p-4" : "justify-end"}`}
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        className={
          centred
            ? "relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-xl"
            : "relative flex h-full w-full max-w-md flex-col border-l border-line bg-paper shadow-xl"
        }
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg text-ink">{title}</h2>
            {subtitle && <p className="text-[0.82rem] text-ink-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-line px-3 py-1 text-[0.82rem] text-ink-muted transition-colors hover:border-accent hover:text-accent"
          >
            Cerrar
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
