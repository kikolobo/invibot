"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { filters, groupings, orders } from "@/lib/reports/guest-report";
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
  const router = useRouter();
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
    agrupar: shape.grouping,
  })}`;

  return (
    <div>
      <div className="mt-6">
        <label className="eyebrow block" htmlFor="filtro">
          Quiénes
        </label>
        {/*
          A select rather than seven pills: the options are mutually exclusive
          and the row of them wrapped to two lines, which read as a toolbar
          rather than a choice. Still URL state — changing it navigates, so the
          print view and a shared link both follow.
        */}
        <select
          id="filtro"
          value={shape.filter}
          onChange={(event) => router.push(hrefWith("filtro", event.target.value), { scroll: false })}
          className="mt-2 rounded-lg border border-line bg-white px-3 py-2 text-[0.9rem] text-ink outline-none transition-colors focus:border-accent"
        >
          {Object.entries(filters).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div>
          <label className="eyebrow block" htmlFor="agrupar">
            Agrupar
          </label>
          <select
            id="agrupar"
            value={shape.grouping}
            onChange={(event) =>
              router.push(hrefWith("agrupar", event.target.value), { scroll: false })
            }
            className="mt-2 rounded-lg border border-line bg-white px-3 py-2 text-[0.9rem] text-ink outline-none transition-colors focus:border-accent"
          >
            {Object.entries(groupings).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

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
            >
              {shape.direction === "asc" ? "A → Z" : "Z → A"}
            </Link>
          </div>
        </div>

        <Link
          href={printHref}
          target="_blank"
          rel="noopener"
          className="rounded-full bg-accent px-4 py-1.5 text-[0.82rem] text-paper"
        >
          Imprimir
        </Link>
      </div>
    </div>
  );
}
