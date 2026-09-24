import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, guests } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { sharedEvents, type EventRole } from "@/lib/events/access";
import { EventRow } from "./event-row";

export const metadata = { title: "Mis eventos" };

export default async function Eventos() {
  const { orgId } = await requireOrg();
  const own = await db
    .select()
    .from(events)
    .where(eq(events.orgId, orgId))
    .orderBy(desc(events.startsAt));

  // Events other people invited this account into sit in the same list, by
  // date, marked with the role rather than kept in a section of their own —
  // for a planner they are simply their events.
  const shared = await sharedEvents();
  const roles = new Map<string, EventRole>(shared.map((row) => [row.event.id, row.role]));
  const all = [...own, ...shared.map((row) => row.event)].sort(
    (a, b) => b.startsAt.getTime() - a.startsAt.getTime(),
  );

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
            className="shrink-0 rounded-full bg-action px-5 py-2.5 text-sm font-medium text-ink-onaction transition-colors hover:bg-action-soft"
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
                <EventRow
                  event={event}
                  guestCount={guestCounts.get(event.id) ?? 0}
                  role={roles.get(event.id) ?? "owner"}
                />
              </li>
            ))}
          </ul>
        )}

        {archived.length > 0 && (
          <Link
            href="/eventos/archivados"
            className="mt-12 flex items-center gap-2.5 text-[0.85rem] text-ink-muted transition-colors hover:text-accent"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="size-4 shrink-0"
              aria-hidden="true"
            >
              <path d="M2.5 5.5h15v2.5h-15z" strokeLinejoin="round" />
              <path d="M4 8v8.5h12V8" strokeLinejoin="round" />
              <path d="M8 11h4" strokeLinecap="round" />
            </svg>
            Archivados
            <span className="text-ink-muted/70">({archived.length})</span>
          </Link>
        )}

      </div>
    </>
  );
}
