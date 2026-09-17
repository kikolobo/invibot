"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { filters, orders } from "@/lib/reports/guest-report";
import type { readShape } from "@/lib/reports/load";

/**
 * Filters, ordering, and the link that opens the printable sheet.
 *
 * Every control is a link, and the whole selection lives in the query string.
 * That is what lets the print view be a separate page: it reads the same URL
 * and renders the same list, with no state to hand across.
 */
export function ReportControls({
  eventId,
  shape,
}: {
  eventId: string;
  shape: ReturnType<typeof readShape>;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const withParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    return next;
  };

  const hrefWith = (key: string, value: string) => `${pathname}?${withParam(key, value)}`;

  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-[0.82rem] transition-colors ${
      active ? "border-accent bg-accent text-paper" : "border-line text-ink-soft hover:border-accent"
    }`;

  // The print view reads exactly the parameters shown here.
  const printHref = `/imprimir/${eventId}?${new URLSearchParams({
    filtro: shape.filter,
    orden: shape.order,
    dir: shape.direction,
    agrupar: shape.grouped ? "1" : "0",
  })}`;

  return (
    <div>
      <div className="mt-6">
        <p className="eyebrow">Quiénes</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(filters).map(([key, label]) => (
            <Link key={key} href={hrefWith("filtro", key)} scroll={false} className={pill(shape.filter === key)}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="eyebrow">Ordenar por</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(orders).map(([key, label]) => (
                <Link key={key} href={hrefWith("orden", key)} scroll={false} className={pill(shape.order === key)}>
                  {label}
                </Link>
              ))}
              <Link
                href={hrefWith("dir", shape.direction === "asc" ? "desc" : "asc")}
                scroll={false}
                className={pill(false)}
                title={shape.direction === "asc" ? "A → Z" : "Z → A"}
              >
                {shape.direction === "asc" ? "A → Z" : "Z → A"}
              </Link>
            </div>
          </div>

          <Link
            href={hrefWith("agrupar", shape.grouped ? "0" : "1")}
            scroll={false}
            className="flex items-center gap-2 pb-1 text-[0.88rem] text-ink-soft transition-colors hover:text-ink"
          >
            <span
              className={`grid size-4 place-items-center rounded border ${
                shape.grouped ? "border-accent bg-accent text-paper" : "border-line"
              }`}
              aria-hidden="true"
            >
              {shape.grouped && (
                <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2.5 6.5 5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            Agrupar por grupo
          </Link>
        </div>

        <Link
          href={printHref}
          target="_blank"
          rel="noopener"
          className="rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper"
        >
          Imprimir o guardar PDF
        </Link>
      </div>
    </div>
  );
}
