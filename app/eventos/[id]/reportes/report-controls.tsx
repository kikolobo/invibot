"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { filters, orders, type FilterKey, type OrderKey } from "@/lib/reports/guest-report";

/**
 * The filters, and the button that prints what they produced.
 *
 * State lives in the URL rather than in React, for one reason: the printed
 * sheet has to be the list on screen. With the selection in the query string
 * the server renders exactly what gets printed, and a filtered list can be
 * bookmarked or sent to whoever is working the door.
 */
export function ReportControls({
  filter,
  order,
}: {
  filter: FilterKey;
  order: OrderKey;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefWith = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    return `${pathname}?${next.toString()}`;
  };

  return (
    <div className="print-hide">
      <div className="mt-6">
        <p className="eyebrow">Quiénes</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(filters).map(([key, label]) => (
            <Link
              key={key}
              href={hrefWith("filtro", key)}
              scroll={false}
              className={`rounded-full border px-3 py-1 text-[0.82rem] transition-colors ${
                filter === key
                  ? "border-accent bg-accent text-paper"
                  : "border-line text-ink-soft hover:border-accent"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Ordenados por</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(orders).map(([key, label]) => (
              <Link
                key={key}
                href={hrefWith("orden", key)}
                scroll={false}
                className={`rounded-full border px-3 py-1 text-[0.82rem] transition-colors ${
                  order === key
                    ? "border-accent bg-accent text-paper"
                    : "border-line text-ink-soft hover:border-accent"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-accent px-5 py-2 text-[0.85rem] text-paper"
        >
          Imprimir o guardar PDF
        </button>
      </div>
    </div>
  );
}
