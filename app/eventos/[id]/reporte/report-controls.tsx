"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { filters, groupings, orders, reportFields } from "@/lib/reports/guest-report";
import { saveReportPreset } from "@/lib/reports/presets";
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
  const [configuring, setConfiguring] = useState(false);
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
      active ? "border-accent bg-action text-ink-onaction" : "border-line text-ink-soft hover:border-accent"
    }`;

  // The print view reads exactly the parameters shown here.
  const current = {
    filtro: shape.filter,
    orden: shape.order,
    dir: shape.direction,
    agrupar: shape.grouping,
    campos: shape.fields.join(","),
  };

  const printHref = `/imprimir/${eventId}?${new URLSearchParams(current)}`;

  // Remembered after the fact, not before: the page has already rendered what
  // the organizer asked for, so a failed write costs a preference and nothing
  // else. Keyed on the serialised view so it writes once per change.
  const signature = new URLSearchParams(current).toString();
  useEffect(() => {
    void saveReportPreset(eventId, Object.fromEntries(new URLSearchParams(signature)));
  }, [eventId, signature]);

  const toggleField = (key: string) => {
    const next = shape.fields.includes(key as never)
      ? shape.fields.filter((field) => field !== key)
      : [...shape.fields, key as never];
    // An empty string is meaningful — it means every column is off — so it is
    // sent rather than omitted, which would fall back to the defaults.
    return hrefWith("campos", next.join(","));
  };

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
          className="mt-2 rounded-lg border border-line bg-paper-deep px-3 py-2 text-[0.9rem] text-ink outline-none transition-colors focus:border-accent"
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
            className="mt-2 rounded-lg border border-line bg-paper-deep px-3 py-2 text-[0.9rem] text-ink outline-none transition-colors focus:border-accent"
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
          className="h-fit self-end rounded-full bg-action px-4 py-1 text-[0.82rem] leading-5 text-ink-onaction"
        >
          Imprimir
        </Link>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => setConfiguring((open) => !open)}
          aria-expanded={configuring}
          className="inline-flex items-center gap-1.5 text-[0.85rem] text-ink-muted transition-colors hover:text-accent"
        >
          <svg
            viewBox="0 0 12 12"
            className={`size-3 transition-transform ${configuring ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M4.5 2.5 8 6l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Configurar
          <span className="text-ink-muted/70">
            ({shape.fields.length} {shape.fields.length === 1 ? "dato" : "datos"})
          </span>
        </button>

        {configuring && (
          <div className="mt-3">
            <p className="text-[0.82rem] leading-relaxed text-ink-muted">
              Qué mostramos de cada invitado. El nombre siempre va.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(reportFields).map(([key, label]) => {
                const active = shape.fields.includes(key as never);
                return (
                  <Link
                    key={key}
                    href={toggleField(key)}
                    scroll={false}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.82rem] transition-colors ${
                      active
                        ? "border-accent bg-action text-ink-onaction"
                        : "border-line text-ink-soft hover:border-accent"
                    }`}
                  >
                    <span
                      className={`grid size-3.5 place-items-center rounded-[3px] border ${
                        active ? "border-paper/60" : "border-line"
                      }`}
                      aria-hidden="true"
                    >
                      {active && (
                        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                          <path d="M2.5 6.5 5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
