import { Fragment } from "react";
import { TZDate } from "@date-fns/tz";
import type { events } from "@/db/schema";
import { formatEventWhere } from "@/lib/events/format";
import { seatsOf, type FieldKey, type ReportSection } from "@/lib/reports/guest-report";
import { formatPhone } from "@/lib/phone";

/**
 * The printed sheet.
 *
 * A table, because a door list is read down a column and not across a row:
 * finding "which table is this person on" means running a finger down Mesa,
 * and that only works if Mesa is always in the same place. The leader dots this
 * replaced put every value at a different horizontal position on every line.
 *
 * Shared by the page and the bare print view, so the preview and the paper
 * cannot drift apart.
 */

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Column behaviour, not column widths.
 *
 * Fixed rem widths were the first attempt and they were wrong: seven of them
 * add up to more than the page, and `table-fixed` then crushes every heading
 * into its neighbour. The table sizes itself from its content instead, with
 * only the short columns pinned against wrapping — a phone number broken
 * across two lines is unreadable, a note is not.
 */
const columns: { key: FieldKey; label: string; cell: string; align?: "right" }[] = [
  // Short headings, because the column only has to be recognised, not read —
  // and every character here is width taken from the names.
  { key: "personas", label: "# pers", cell: "whitespace-nowrap", align: "right" },
  { key: "mesa", label: "Mesa", cell: "whitespace-nowrap", align: "right" },
  { key: "grupo", label: "Grupo", cell: "whitespace-nowrap" },
  { key: "telefono", label: "Tel", cell: "whitespace-nowrap" },
  { key: "correo", label: "Email", cell: "break-all" },
];

export function ReportSheet({
  event,
  sections,
  filterLabel,
  total,
  seats,
  grouping,
  fields,
}: {
  event: typeof events.$inferSelect;
  sections: ReportSection[];
  filterLabel: string;
  total: number;
  seats: number;
  grouping: "no" | "grupo" | "mesa";
  fields: FieldKey[];
}) {
  const named = grouping !== "no";
  const on = (field: FieldKey) => fields.includes(field);

  // Notes are not a column. They run long, and a long note in a narrow column
  // is a paragraph two words wide — it gets its own full-width line under the
  // person instead.
  const withNotes = on("notas");

  // A column already spelled out by the section heading is dead weight in
  // every row underneath it.
  const shown = columns.filter(
    (column) =>
      on(column.key) &&
      !(column.key === "grupo" && grouping === "grupo") &&
      !(column.key === "mesa" && grouping === "mesa"),
  );

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
        /*
         * One table for the whole sheet, not one per section.
         * A table sizes its columns from its own content, so a table per
         * section put Mesa in a different place under every letter — which is
         * the opposite of a column. Section headings are rows spanning the full
         * width instead.
         */
        <div className="report-scroll mt-4 overflow-x-auto">
          <table className="w-full text-left text-[0.82rem]">
            <thead>
              {/* Repeats at the top of every printed page. */}
              <tr className="text-[0.72rem] uppercase tracking-wide text-ink-muted">
                <th className="w-6 py-1 pr-2 font-normal" />
                <th className="py-1 pr-4 font-normal">Nombre</th>
                {shown.map((column) => (
                  <th
                    key={column.key}
                    className={`whitespace-nowrap py-1 pr-4 font-normal last:pr-0 ${
                      column.align === "right" ? "text-right" : ""
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            {sections.map((section) => (
              <tbody key={section.heading} className="report-section">
                <tr>
                  <td colSpan={shown.length + 2} className="pb-1 pt-6">
                    {named ? (
                      <div className="flex items-center gap-3">
                        <span className="font-display text-lg text-ink">{section.heading}</span>
                        <span className="h-px flex-1 bg-line" />
                        <span className="text-[0.8rem] text-ink-muted">
                          {section.guests.length}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-3">
                        <span className="font-display text-3xl leading-none text-accent">
                          {section.heading}
                        </span>
                        <span className="h-px flex-1 self-center bg-line" />
                      </div>
                    )}
                  </td>
                </tr>

                {section.guests.map((guest) => {
                  const seatCount = seatsOf(guest);
                  const cell = (key: FieldKey): string => {
                    switch (key) {
                      case "personas":
                        return seatCount >= 1 ? String(seatCount) : "—";
                      case "mesa":
                        return guest.tableNumber ?? "—";
                      case "grupo":
                        return guest.groupName ?? "—";
                      case "telefono":
                        return guest.phoneE164 ? formatPhone(guest.phoneE164) : "—";
                      case "correo":
                        return guest.email ?? "—";
                      case "notas":
                        return guest.notes ?? "—";
                      default:
                        return "—";
                    }
                  };

                  return (
                    <Fragment key={guest.id}>
                    <tr
                      className={`border-t border-line/50 align-top ${
                        withNotes && guest.notes ? "report-keep-next" : ""
                      }`}
                    >
                      <td className="py-1.5 pr-2">
                        {/* Something to tick with a pen at the door. */}
                        <span className="mt-0.5 block size-4 rounded-[3px] border border-ink-muted/50" />
                      </td>
                      {/* The name never wraps: a door list is read by name,
                          and "Ángela Ruiz" broken over two lines costs more
                          width in practice than it saves. */}
                      <td className="whitespace-nowrap py-1.5 pr-4 text-ink">
                        {guest.fullName}
                        {on("vip") && guest.isVip && (
                          // "V", never "VIP": a guest reading the list over
                          // someone's shoulder should not be able to tell who
                          // was ranked above them.
                          <span
                            className="ml-2 inline-grid size-4 translate-y-0.5 select-none place-items-center rounded-full border border-accent text-[0.62rem] font-medium leading-none text-accent"
                            aria-hidden="true"
                          >
                            V
                          </span>
                        )}
                      </td>
                      {shown.map((column) => (
                        <td
                          key={column.key}
                          className={`py-1.5 pr-4 text-ink-soft last:pr-0 ${column.cell} ${
                            column.align === "right" ? "text-right" : ""
                          }`}
                        >
                          {cell(column.key)}
                        </td>
                      ))}
                    </tr>
                    {withNotes && guest.notes && (
                      <tr>
                        <td />
                        <td
                          colSpan={shown.length + 1}
                          className="pb-1.5 pr-0 text-[0.78rem] leading-relaxed text-ink-muted"
                        >
                          {guest.notes}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </article>
  );
}
