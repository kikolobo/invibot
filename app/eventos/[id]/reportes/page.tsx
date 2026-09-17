import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { db } from "@/db";
import { events, guests, guestGroups } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { formatEventWhere } from "@/lib/events/format";
import {
  applyFilter,
  buildSections,
  filters,
  isFilter,
  isOrder,
  seatsOf,
  type FilterKey,
  type OrderKey,
} from "@/lib/reports/guest-report";
import { ReportControls } from "./report-controls";

export const metadata = { title: "Reportes" };

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function Reportes({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { orgId } = await requireOrg();

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.orgId, orgId)),
  });
  if (!event) notFound();

  const rawFilter = String(query.filtro ?? "confirmados");
  const rawOrder = String(query.orden ?? "nombre");
  const filter: FilterKey = isFilter(rawFilter) ? rawFilter : "confirmados";
  const order: OrderKey = isOrder(rawOrder) ? rawOrder : "nombre";

  const rows = await db
    .select({
      id: guests.id,
      fullName: guests.fullName,
      firstName: guests.firstName,
      groupName: guestGroups.name,
      rsvpStatus: guests.rsvpStatus,
      partySizeConfirmed: guests.partySizeConfirmed,
      partySizeAllowed: guests.partySizeAllowed,
    })
    .from(guests)
    .leftJoin(guestGroups, eq(guests.groupId, guestGroups.id))
    .where(eq(guests.eventId, id));

  const selected = applyFilter(rows, filter);
  const sections = buildSections(selected, order);
  const seats = selected.reduce((total, guest) => total + seatsOf(guest), 0);

  return (
    <div>
      <div className="print-hide">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">Reportes</h1>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
          La lista para quien recibe en la puerta. Filtra, ordénala como la vayas a leer
          e imprímela.
        </p>
      </div>

      <ReportControls filter={filter} order={order} />

      {/* The sheet. On screen it sits in a card; on paper it is the page. */}
      <article className="print-sheet mt-8 rounded-xl border border-line bg-white p-8">
        <header className="border-b border-line pb-4">
          <h2 className="font-display text-2xl text-ink">{event.name}</h2>
          <p className="mt-1 text-[0.9rem] text-ink-soft first-letter:uppercase">
            {dateFmt.format(new TZDate(event.startsAt, event.timezone))}
            {formatEventWhere(event) && ` · ${formatEventWhere(event)}`}
          </p>
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            {filters[filter]} · {selected.length}{" "}
            {selected.length === 1 ? "invitado" : "invitados"}
            {seats > 0 && ` · ${seats} ${seats === 1 ? "lugar" : "lugares"}`}
          </p>
        </header>

        {sections.length === 0 ? (
          <p className="py-10 text-center text-ink-muted">
            Nadie en esta lista todavía.
          </p>
        ) : (
          sections.map((section) => (
            <section key={section.heading} className="print-section mt-7">
              {order === "grupo" ? (
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
                  <span className="h-px flex-1 bg-line" />
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
                      <span className="mt-0.5 size-3.5 shrink-0 rounded-sm border border-line" />
                      <span className="text-ink">{guest.fullName}</span>
                      {order !== "grupo" && guest.groupName && (
                        <span className="text-[0.8rem] text-ink-muted">{guest.groupName}</span>
                      )}
                      <span className="ml-auto text-[0.85rem] text-ink-soft">
                        {seatCount >= 2 ? `${seatCount} personas` : seatCount === 1 ? "1" : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </article>
    </div>
  );
}
