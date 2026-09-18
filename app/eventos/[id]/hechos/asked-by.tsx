"use client";

import { useState } from "react";

/**
 * Who asked, behind a small "i".
 *
 * Who is asking changes what you write — the answer for your mother-in-law is
 * not the answer for the friend who asks everything — but the names are not
 * what you read the list by, so they stay folded away until wanted.
 */
export function AskedBy({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false);

  if (names.length === 0) return null;

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-label={`Ver quién preguntó (${names.length})`}
        title="Quién preguntó"
        className={`ml-2 grid size-4 place-items-center rounded-full border text-[0.6rem] font-medium leading-none transition-colors ${
          open
            ? "border-accent bg-action text-paper"
            : "border-ink-muted/50 text-ink-muted hover:border-accent hover:text-accent"
        }`}
      >
        i
      </button>

      {open && (
        <span className="absolute left-0 top-6 z-10 block min-w-44 rounded-lg border border-line bg-white p-3 shadow-sm">
          <span className="block text-[0.72rem] uppercase tracking-wide text-ink-muted">
            {names.length === 1 ? "Preguntó" : "Preguntaron"}
          </span>
          <span className="mt-1 block space-y-0.5">
            {names.map((name) => (
              <span key={name} className="block text-[0.85rem] text-ink">
                {name}
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}
