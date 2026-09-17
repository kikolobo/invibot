import { TZDate } from "@date-fns/tz";
import type { events } from "@/db/schema";
import { formatEventWhere } from "@/lib/events/format";
import { seatsOf, type ReportSection } from "@/lib/reports/guest-report";

/**
 * The printed sheet itself.
 *
 * Shared by the page in the app and the bare print view, so what is previewed
 * is what comes out of the printer — one implementation, not a design and a
 * copy of it that drift apart.
 */

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function ReportSheet({
  event,
  sections,
  filterLabel,
  total,
  seats,
  grouped,
}: {
  event: typeof events.$inferSelect;
  sections: ReportSection[];
  filterLabel: string;
  total: number;
  seats: number;
  grouped: boolean;
}) {
  return (
    <article className="report-sheet">
      <header className="border-b border-line pb-4">
        <h2 className="font-display text-2xl text-ink">{event.name}</h2>
        <p className="mt-1 max-w-[46rem] text-[0.9rem] leading-relaxed text-ink-soft first-letter:uppercase">
          {dateFmt.format(new TZDate(event.startsAt, event.timezone))}
          {formatEventWhere(event) && ` · ${formatEventWhere(event)}`}
        </p>
        <p className="mt-3 text-[0.85rem] text-ink-muted">
          {filterLabel} · {total} {total === 1 ? "invitado" : "invitados"}
          {seats > 0 && ` · ${seats} ${seats === 1 ? "lugar" : "lugares"}`}
        </p>
      </header>

      {sections.length === 0 ? (
        <p className="py-10 text-center text-ink-muted">Nadie en esta lista todavía.</p>
      ) : (
        sections.map((section) => (
          <section key={section.heading} className="report-section mt-7">
            {grouped ? (
              <div className="flex items-center gap-3">
                <h3 className="font-display text-lg text-ink">{section.heading}</h3>
                <span className="h-px flex-1 bg-line" />
                <span className="text-[0.8rem] text-ink-muted">{section.guests.length}</span>
              </div>
            ) : (
              <div className="flex items-baseline gap-3">
                <span className="font-display text-3xl leading-none text-accent">
                  {section.heading}
                </span>
                <span className="h-px flex-1 self-center bg-line" />
              </div>
            )}

            <ul className="mt-3">
              {section.guests.map((guest) => {
                const seatCount = seatsOf(guest);
                return (
                  <li
                    key={guest.id}
                    className="flex items-baseline gap-3 border-b border-line/50 py-1.5 last:border-0"
                  >
                    {/* Something to tick with a pen at the door. */}
                    <span className="size-4 shrink-0 self-center rounded-[3px] border border-ink-muted/50" />
                    <span className="text-ink">{guest.fullName}</span>
                    {guest.isVip && (
                      // "V", never "VIP": a guest glancing at the list at the
                      // door should not be able to read who was ranked above
                      // them.
                      <span
                        className="grid size-4 shrink-0 select-none place-items-center self-center rounded-full border border-accent text-[0.62rem] font-medium leading-none text-accent"
                        aria-hidden="true"
                      >
                        V
                      </span>
                    )}
                    <span className="mx-2 flex-1 border-b border-dotted border-line/80" />
                    <span className="shrink-0 text-[0.85rem] text-ink-soft">
                      {seatCount >= 2 ? `${seatCount} personas` : seatCount === 1 ? "1" : "—"}
                    </span>
                    {guest.tableNumber && (
                      <span className="w-20 shrink-0 text-right text-[0.85rem] text-ink-soft">
                        Mesa {guest.tableNumber}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </article>
  );
}
