import Link from "next/link";
import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { events, guests } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { EventRow } from "../event-row";

export const metadata = { title: "Archivados" };

export default async function Archivados() {
  const { orgId } = await requireOrg();

  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.orgId, orgId), isNotNull(events.archivedAt)))
    .orderBy(desc(events.archivedAt));

  const guestCounts = new Map(
    (
      await db
        .select({ eventId: guests.eventId, n: count() })
        .from(guests)
        .groupBy(guests.eventId)
    ).map((row) => [row.eventId, row.n]),
  );

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
      <Link href="/eventos" className="text-[0.85rem] text-ink-muted hover:text-accent">
        ← Mis eventos
      </Link>
      <h1 className="mt-4 font-display text-4xl text-ink sm:text-5xl">Archivados</h1>
      <p className="mt-4 leading-relaxed text-ink-soft">
        Nada se borró. Estos eventos conservan sus invitados, sus mensajes y sus
        confirmaciones, pero no pueden editarse. Puedes restaurar uno o usarlo como
        base para uno nuevo.
      </p>

      {rows.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-line bg-paper-deep p-8 text-center text-ink-muted">
          No tienes eventos archivados.
        </p>
      ) : (
        <ul className="mt-10 space-y-3">
          {rows.map((event) => (
            <li key={event.id}>
              <EventRow
                event={event}
                guestCount={guestCounts.get(event.id) ?? 0}
                archived
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
