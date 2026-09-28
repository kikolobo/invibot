"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Composer } from "./composer";

type Tab = "new" | "sent";

/**
 * Writing a message and the ones already sent, as two tabs — the same strip
 * Detalles uses. Both stay mounted and the inactive one is hidden, so a draft
 * half-written survives a look at what was sent last week.
 *
 * Sending moves to "Enviados", where the message just created is at the top:
 * that is the next thing anyone wants to see.
 */
export function MensajesTabs({
  composer,
  sentCount,
  children,
}: {
  /** Null on an archived event, which keeps its history but sends nothing. */
  composer: Omit<ComponentProps<typeof Composer>, "onSent"> | null;
  sentCount: number;
  /** The history, rendered on the server. */
  children: ReactNode;
}) {
  const [active, setActive] = useState<Tab>(composer ? "new" : "sent");
  const [notice, setNotice] = useState<string | null>(null);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    ...(composer ? [{ id: "new" as const, label: "Nuevo mensaje" }] : []),
    { id: "sent", label: "Enviados", badge: sentCount },
  ];

  return (
    <div className="mt-8">
      <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
        <div role="tablist" className="flex gap-1 border-b border-line">
          {tabs.map((tab) => {
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(tab.id)}
                className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-[0.9rem] transition-colors ${
                  selected
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-muted hover:text-ink-soft"
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-2 text-[0.75rem] text-ink-muted">{tab.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {composer && (
        <section hidden={active !== "new"} className="mt-8">
          <Composer
            {...composer}
            onSent={(message) => {
              setNotice(message);
              setActive("sent");
            }}
          />
        </section>
      )}

      <section hidden={active !== "sent"} className="mt-8">
        {notice && (
          <p className="mb-4 rounded-lg border border-accent/30 bg-action/5 px-4 py-3 text-[0.9rem] text-ink-soft">
            {notice}
          </p>
        )}
        {children}
      </section>
    </div>
  );
}
