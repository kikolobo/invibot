import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { guests, guestGroups, sends } from "@/db/schema";
import { requireEventAccess } from "@/lib/events/access";
import { listGroups } from "@/lib/guests/actions";
import { invitationPlan, eventVariables, greetingName, templateForGuest } from "@/lib/campaigns/recipients";
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
  const { event } = await requireEventAccess(id, "guests");

  const rows = await db
    .select({
      id: guests.id,
      fullName: guests.fullName,
      phoneE164: guests.phoneE164,
      email: guests.email,
      groupName: guestGroups.name,
      partySizeAllowed: guests.partySizeAllowed,
      companions: guests.companions,
      partySizeConfirmed: guests.partySizeConfirmed,
      isVip: guests.isVip,
      tableNumber: guests.tableNumber,
      notes: guests.notes,
      rsvpStatus: guests.rsvpStatus,
      inviteStatus: guests.inviteStatus,
      rsvpReminderSentAt: guests.rsvpReminderSentAt,
      createdAt: guests.createdAt,
      updatedAt: guests.updatedAt,
      rsvpRespondedAt: guests.rsvpRespondedAt,
      // Las últimas 24 horas las decide Postgres, con su reloj y en la misma
      // consulta: un `Date.now()` aquí sería una hora al renderizar el HTML y
      // otra al hidratarlo, y dos números distintos en la misma página.
      confirmedRecently: sql<boolean>`coalesce(
        ${guests.rsvpStatus} = 'confirmed'
        and ${guests.rsvpRespondedAt} > now() - interval '24 hours', false)`,
      approvedRecently: sql<boolean>`coalesce(
        ${guests.source} = 'self'
        and ${guests.approvedAt} > now() - interval '24 hours', false)`,
      // Off the ledger rather than a column: "cuándo se le invitó" is the
      // moment a message left, and that is what `sends` records. The latest
      // one, because a corrected phone number earns a second invitation and
      // the useful date is the one that reached them.
      invitedAt: sql<string | null>`(
        select max(${sends.sentAt}) from ${sends}
        where ${sends.guestId} = ${guests.id} and ${sends.kind} = 'invite'
      )`,
    })
    .from(guests)
    .leftJoin(guestGroups, eq(guests.groupId, guestGroups.id))
    // Approved only. Someone who registered themselves is not a guest yet, and
    // showing them here would make every count on this table mean two things.
    .where(and(eq(guests.eventId, id), eq(guests.approvalStatus, "approved")))
    .orderBy(asc(guestGroups.sortOrder), asc(guests.fullName));


  // The +1 by name, which is what the table and the edit form actually show.
  const guestRows = rows.map(({ companions, ...row }) => ({
    ...row,
    companionName: companions[0] ?? null,
  }));

  const groups = await listGroups(id);
  const archived = event.archivedAt !== null;

  // Who could be invited right now, decided by the same module the send action
  // uses — so the panel cannot offer a recipient the action would refuse.
  const plan = await invitationPlan(id);
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

  const recent = {
    /** Quien confirmó en las últimas 24 horas, lo haya dicho él o lo hayas registrado tú. */
    confirmed: rows.filter((g) => g.confirmedRecently).map((g) => g.id),
    /** Quien se registró solo y aprobaste en las últimas 24 horas. */
    approved: rows.filter((g) => g.approvedRecently).map((g) => g.id),
  };

  return (
    <div>

      <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
        Invitados
      </h1>



      <div className="mt-3">
        <GuestTable
          eventId={event.id}
          eventName={event.name}
          rows={guestRows}
          invite={invite}
          groups={groups}
          maxPartySize={event.maxPartySize}
          archived={archived}
          capacity={event.capacity}
          autoRegister={event.autoRegisterEnabled}
          recent={recent}
        />
      </div>

      {archived && (
        <p className="mt-8 rounded-xl border border-line bg-paper-deep p-5 text-[0.88rem] leading-relaxed text-ink-muted">
          Este evento está archivado. Su lista se conserva completa, pero no puede
          cambiarse ni recibir invitaciones.
        </p>
      )}

      {/* Adding one guest moved into a dialog over the list; importing many
          stays here, where it is a deliberate trip rather than something you
          scroll past forty names to reach. */}
      <div className={`mt-10 ${archived ? "hidden" : ""}`}>
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
