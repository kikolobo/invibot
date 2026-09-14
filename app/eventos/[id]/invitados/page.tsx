import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, guests, guestGroups } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { listGroups } from "@/lib/guests/actions";
import { AddGuest } from "./add-guest";
import { ImportGuests } from "./import-guests";
import { GuestTable } from "./guest-table";

export const metadata = { title: "Invitados" };

export default async function Invitados({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireOrg();

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.orgId, orgId)),
  });
  if (!event) notFound();

  const rows = await db
    .select({
      id: guests.id,
      fullName: guests.fullName,
      phoneE164: guests.phoneE164,
      email: guests.email,
      groupName: guestGroups.name,
      partySizeAllowed: guests.partySizeAllowed,
      partySizeConfirmed: guests.partySizeConfirmed,
      rsvpStatus: guests.rsvpStatus,
      inviteStatus: guests.inviteStatus,
    })
    .from(guests)
    .leftJoin(guestGroups, eq(guests.groupId, guestGroups.id))
    .where(eq(guests.eventId, id))
    .orderBy(asc(guestGroups.sortOrder), asc(guests.fullName));

  const groups = await listGroups(id);

  const confirmed = rows.filter((g) => g.rsvpStatus === "confirmed");
  const seats = confirmed.reduce(
    (total, g) => total + (g.partySizeConfirmed ?? g.partySizeAllowed),
    0,
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:px-10">
      <Link
        href={`/eventos/${event.id}`}
        className="text-[0.85rem] text-ink-muted hover:text-accent"
      >
        ← {event.name}
      </Link>

      <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
        Invitados
      </h1>

      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 border-y border-line py-5">
        <div>
          <dt className="eyebrow">En la lista</dt>
          <dd className="mt-1 font-display text-2xl text-ink">{rows.length}</dd>
        </div>
        <div>
          <dt className="eyebrow">Confirmados</dt>
          <dd className="mt-1 font-display text-2xl text-ink">{confirmed.length}</dd>
        </div>
        <div>
          <dt className="eyebrow">Lugares confirmados</dt>
          <dd className="mt-1 font-display text-2xl text-ink">{seats}</dd>
        </div>
        {event.capacity && (
          <div>
            <dt className="eyebrow">Cupo</dt>
            <dd className="mt-1 font-display text-2xl text-ink">{event.capacity}</dd>
          </div>
        )}
      </dl>

      <div className="mt-8">
        <GuestTable eventId={event.id} rows={rows} />
      </div>

      <div className="mt-10 space-y-5">
        <AddGuest
          eventId={event.id}
          maxPartySize={event.maxPartySize}
          allowPlusOnes={event.allowPlusOnes}
          groups={groups}
        />
        <ImportGuests eventId={event.id} />
      </div>

      <p className="mt-8 text-[0.85rem] leading-relaxed text-ink-muted">
        Los números se guardan en formato internacional. Reconocemos las formas
        antiguas mexicanas (+52 1…, 044, 045) y detectamos repetidos aunque
        estén escritos distinto.
      </p>
    </div>
  );
}
