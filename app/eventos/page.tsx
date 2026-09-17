import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { db } from "@/db";
import { events, guests } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { eventKindLabels } from "@/lib/events/kinds";
import { CloneEvent } from "./clone-event";
import { UnarchiveButton } from "./unarchive-button";

export const metadata = { title: "Mis eventos" };

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function Eventos() {
  const { orgId } = await requireOrg();
  const all = await db
    .select()
    .from(events)
    .where(eq(events.orgId, orgId))
    .orderBy(desc(events.startsAt));

  const rows = all.filter((event) => event.archivedAt === null);
  const archived = all.filter((event) => event.archivedAt !== null);

  // One grouped query rather than one per row — the duplicate form needs to say
  // how many people it would copy.
  const guestCounts = new Map(
    (
      await db
        .select({ eventId: guests.eventId, n: count() })
        .from(guests)
        .groupBy(guests.eventId)
    ).map((row) => [row.eventId, row.n]),
  );

  return (
    <>
      <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-4xl text-ink sm:text-5xl">Mis eventos</h1>
          <Link
            href="/eventos/nuevo"
            className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-accent-soft"
          >
            Nuevo evento
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed border-line bg-paper-deep p-8 text-center text-ink-muted">
            Todavía no tienes eventos.
          </p>
        ) : (
          <ul className="mt-10 space-y-3">
            {rows.map((event) => (
              <li key={event.id}>
                <EventRow event={event} guestCount={guestCounts.get(event.id) ?? 0} />
              </li>
            ))}
          </ul>
        )}

        {archived.length > 0 && (
          <section className="mt-14">
            <h2 className="eyebrow">Archivados</h2>
            <p className="mt-2 text-[0.85rem] text-ink-muted">
              Se conservan completos y no pueden editarse. Puedes restaurarlos o
              usarlos como base para uno nuevo.
            </p>
            <ul className="mt-5 space-y-3">
              {archived.map((event) => (
                <li key={event.id}>
                  <EventRow
                    event={event}
                    guestCount={guestCounts.get(event.id) ?? 0}
                    archived
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function EventRow({
  event,
  guestCount,
  archived = false,
}: {
  event: typeof events.$inferSelect;
  guestCount: number;
  archived?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 transition-colors ${
        archived
          ? "border-line/70 bg-transparent hover:border-line"
          : "border-line bg-paper-deep hover:border-accent"
      }`}
    >
      <Link href={`/eventos/${event.id}`} className="block">
        <div className="flex items-baseline justify-between gap-4">
          <h2
            className={`font-display text-xl ${archived ? "text-ink-soft" : "text-ink"}`}
          >
            {event.name}
          </h2>
          <span className="eyebrow shrink-0">{eventKindLabels[event.kind].es}</span>
        </div>
        <p className="mt-1 text-[0.9rem] text-ink-soft">
          {dateFmt.format(new TZDate(event.startsAt, event.timezone))}
          {event.venueName && ` · ${event.venueName}`}
        </p>
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
        {archived && <UnarchiveButton eventId={event.id} />}
        <CloneEvent eventId={event.id} name={event.name} guestCount={guestCount} />
      </div>
    </div>
  );
}
