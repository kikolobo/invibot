import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { db } from "@/db";
import { events } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { eventKindLabels } from "@/lib/events/kinds";

export const metadata = { title: "Mis eventos" };

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function Eventos() {
  const { orgId } = await requireOrg();
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.orgId, orgId))
    .orderBy(desc(events.startsAt));

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
                <Link
                  href={`/eventos/${event.id}`}
                  className="block rounded-xl border border-line bg-paper-deep p-5 transition-colors hover:border-accent"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-xl text-ink">{event.name}</h2>
                    <span className="eyebrow shrink-0">
                      {eventKindLabels[event.kind].es}
                    </span>
                  </div>
                  <p className="mt-1 text-[0.9rem] text-ink-soft">
                    {dateFmt.format(new TZDate(event.startsAt, event.timezone))}
                    {event.venueName && ` · ${event.venueName}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
