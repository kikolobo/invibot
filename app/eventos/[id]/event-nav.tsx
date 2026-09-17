"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveEvent, unarchiveEvent } from "@/lib/events/actions";

/**
 * The event's own menu, alongside every one of its pages.
 *
 * Grouped rather than flat so commands do not read as more places to go: the
 * top group navigates, the bottom acts. New entries belong in whichever group
 * matches — that separation is the part worth keeping as this grows.
 */
export function EventNav({
  eventId,
  eventName,
  guestCount,
  openQuestions,
  archived,
}: {
  eventId: string;
  eventName: string;
  guestCount: number;
  /** Guests are waiting on these, so the count follows the organizer around. */
  openQuestions: number;
  archived: boolean;
}) {
  const pathname = usePathname();
  const base = `/eventos/${eventId}`;

  const links = [
    { href: base, label: "Resumen" },
    // The questionnaire is an editor; an archived event has nothing to do there.
    ...(archived ? [] : [{ href: `${base}/detalles`, label: "Detalles del evento" }]),
    { href: `${base}/invitados`, label: "Lista de invitados", badge: guestCount },
    { href: `${base}/reporte`, label: "Reporte" },
    {
      href: `${base}/hechos`,
      label: "Lo que sabe",
      badge: openQuestions,
      // A plain count reads as "how many facts"; this one means "somebody is
      // waiting on you", so it is coloured rather than quiet.
      urgent: openQuestions > 0,
    },
    // Available on an archived event too: it reads, it does not change anything.
    { href: `${base}/simulador`, label: "Simulador WhatsApp" },
  ];

  return (
    <nav className="print-hide shrink-0 sm:w-52">
      <p className="truncate font-display text-lg text-ink" title={eventName}>
        {eventName}
      </p>
      <Link
        href="/eventos"
        className="mt-1 inline-block text-[0.8rem] text-ink-muted transition-colors hover:text-accent"
      >
        ← Mis eventos
      </Link>

      <ul className="mt-5 flex gap-1 overflow-x-auto sm:block sm:space-y-0.5 sm:overflow-visible">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-[0.88rem] transition-colors ${
                  active
                    ? "bg-paper-deep font-medium text-ink"
                    : "text-ink-soft hover:bg-paper-deep hover:text-ink"
                }`}
              >
                {link.label}
                {link.badge !== undefined && link.badge > 0 && (
                  <span
                    className={
                      "urgent" in link && link.urgent
                        ? "rounded-full bg-accent px-1.5 py-0.5 text-[0.7rem] font-medium leading-none text-paper"
                        : "text-[0.78rem] text-ink-muted"
                    }
                  >
                    {link.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t border-line pt-4">
        <ArchiveCommand eventId={eventId} archived={archived} />
      </div>
    </nav>
  );
}

/**
 * Compact on purpose: a full confirmation panel does not fit a menu column, so
 * this asks in place and keeps archiving one deliberate second step.
 */
function ArchiveCommand({ eventId, archived }: { eventId: string; archived: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: (id: string) => Promise<{ error?: string }>) =>
    start(async () => {
      const result = await fn(eventId);
      setError(result.error ?? null);
      if (!result.error) setConfirming(false);
    });

  if (archived) {
    return (
      <>
        <button
          type="button"
          onClick={() => run(unarchiveEvent)}
          disabled={pending}
          className="w-full rounded-lg px-3 py-2 text-left text-[0.88rem] text-accent transition-colors hover:bg-paper-deep disabled:opacity-50"
        >
          {pending ? "Restaurando…" : "Desarchivar"}
        </button>
        {error && <p className="px-3 pt-1 text-[0.78rem] text-accent">{error}</p>}
      </>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg px-3 py-2 text-left text-[0.88rem] text-ink-muted transition-colors hover:bg-paper-deep hover:text-ink"
      >
        Archivar invitación
      </button>
    );
  }

  return (
    <div className="px-3">
      <p className="text-[0.82rem] leading-relaxed text-ink-soft">
        ¿Archivar? Deja de poder editarse; nada se borra.
      </p>
      {error && <p className="mt-1 text-[0.78rem] text-accent">{error}</p>}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => run(archiveEvent)}
          disabled={pending}
          className="rounded-full bg-accent px-3 py-1 text-[0.8rem] text-paper disabled:opacity-50"
        >
          {pending ? "…" : "Archivar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-[0.8rem] text-ink-muted hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
