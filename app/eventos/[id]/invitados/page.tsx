import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, guests, guestGroups } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { listGroups } from "@/lib/guests/actions";
import {
  invitationPlan,
  eventVariables,
  greetingName,
  templateForGuest,
} from "@/lib/campaigns/recipients";
import { AddGuest } from "./add-guest";
import { ImportGuests } from "./import-guests";
import { GuestTable } from "./guest-table";

export const metadata = { title: "Invitados" };

/**
 * Sending is sequential and paid per message, so the default action timeout is
 * not enough for a real guest list. Set on the page because that is what
 * governs every Server Action invoked from it.
 */
export const maxDuration = 60;

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
      isVip: guests.isVip,
      tableNumber: guests.tableNumber,
      notes: guests.notes,
      rsvpStatus: guests.rsvpStatus,
      inviteStatus: guests.inviteStatus,
      rsvpReminderSentAt: guests.rsvpReminderSentAt,
    })
    .from(guests)
    .leftJoin(guestGroups, eq(guests.groupId, guestGroups.id))
    // Approved only. Someone who registered themselves is not a guest yet, and
    // showing them here would make every count on this table mean two things.
    .where(and(eq(guests.eventId, id), eq(guests.approvalStatus, "approved")))
    .orderBy(asc(guestGroups.sortOrder), asc(guests.fullName));


  const groups = await listGroups(id);
  const archived = event.archivedAt !== null;

  // Who could be invited right now, decided by the same module the send action
  // uses — so the panel cannot offer a recipient the action would refuse.
  const plan = await invitationPlan(id, orgId);
  const invite = {
    eventVars: plan && plan.missing.length === 0 ? eventVariables(plan.event) : [],
    missing: plan?.missing ?? [],
    eligible: Object.fromEntries(
      (plan?.eligible ?? []).map((guest) => [
        guest.id,
        {
          greeting: greetingName(guest),
          template: templateForGuest(guest),
        },
      ]),
    ),
    skipped: Object.fromEntries(
      (plan?.skipped ?? []).map(({ guest, reason }) => [guest.id, reason]),
    ),
  };

  const confirmed = rows.filter((g) => g.rsvpStatus === "confirmed");
  const seats = confirmed.reduce(
    (total, g) => total + (g.partySizeConfirmed ?? g.partySizeAllowed),
    0,
  );

  return (
    <div>

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

      <div className="mt-6 flex justify-end">
        <a
          href={`/api/eventos/${event.id}/guests.csv`}
          className="text-[0.85rem] text-ink-muted transition-colors hover:text-accent"
        >
          Exportar a CSV
        </a>
      </div>

      <div className="mt-3">
        <GuestTable
          eventId={event.id}
          eventName={event.name}
          rows={rows}
          invite={invite}
          groups={groups}
          maxPartySize={event.maxPartySize}
          archived={archived}
        />
      </div>

      {archived && (
        <p className="mt-8 rounded-xl border border-line bg-paper-deep p-5 text-[0.88rem] leading-relaxed text-ink-muted">
          Este evento está archivado. Su lista se conserva completa, pero no puede
          cambiarse ni recibir invitaciones.
        </p>
      )}

      <div className={`mt-10 space-y-5 ${archived ? "hidden" : ""}`}>
        <AddGuest
          eventId={event.id}
          maxPartySize={event.maxPartySize}
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
