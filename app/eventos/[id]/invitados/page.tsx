import { formatDeadline, rsvpClosed } from "@/lib/events/rsvp-deadline";
import { wallClock } from "@/lib/events/zones";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { guests, guestGroups, sends } from "@/db/schema";
import { requireEventAccess } from "@/lib/events/access";
import { reconcilePending } from "@/lib/billing/credit";
import { listGroups } from "@/lib/guests/actions";
import { invitationPlan, eventVariables, greetingName, templateForGuest } from "@/lib/campaigns/recipients";
import Link from "next/link";
import { can } from "@/lib/events/access";
import { requireOrg } from "@/lib/auth/session";
import { waysToAdd } from "@/lib/guests/ways";
import { ContactsWay, ImportWay, NOTHING_SENT, OneByOneWay, RegistrationWay } from "./ways";
import { GuestTable } from "./guest-table";

export const metadata = { title: "Invitados" };

const TABS = [
  { key: "lista", label: "Lista" },
  { key: "importar", label: "Importar" },
  { key: "otras", label: "Otras formas" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/**
 * Sending is sequential and paid per message, so the default action timeout is
 * not enough for a real guest list. Set on the page because that is what
 * governs every Server Action invoked from it.
 */
export const maxDuration = 60;

export default async function Invitados({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pago?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { pago, tab: requested } = await searchParams;
  const access = await requireEventAccess(id, "guests");
  const { event } = access;
  // Back from paying inside "Enviar invitaciones": count the payment before
  // anything else reads the places.
  if (pago === "listo") await reconcilePending(id);

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
  // An archived list cannot grow, so only the list itself is offered.
  const tabs = archived ? TABS.slice(0, 1) : TABS;
  const tab: Tab = tabs.some((t) => t.key === requested) ? (requested as Tab) : "lista";
  const ways = tab === "otras" ? await waysToAdd(event, (await requireOrg()).userId) : null;

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
    // Sending still works once confirmations close; the panel says so and
    // offers to move the date.
    closedDeadline: rsvpClosed(event) ? formatDeadline(event) : null,
    eventDate: wallClock(event.startsAt, event.timezone).date,
  };

  const recent = {
    /** Quien confirmó en las últimas 24 horas, lo haya dicho él o lo hayas registrado tú. */
    confirmed: rows.filter((g) => g.confirmedRecently).map((g) => g.id),
    /** Quien se registró solo y aprobaste en las últimas 24 horas. */
    approved: rows.filter((g) => g.approvedRecently).map((g) => g.id),
  };

  return (
    <div>

      {pago === "listo" && (
        <p className="mb-6 rounded-xl border border-line bg-paper-deep px-5 py-4 text-[0.9rem] text-ink">
          ¡Gracias! Con tarjeta tus lugares ya están listos: vuelve a seleccionar a tus invitados y dale «Enviar
          invitaciones». Si pagaste en OXXO o por transferencia, se acreditan en cuanto el banco nos avise.
        </p>
      )}

      <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
        Invitados
      </h1>

      {tabs.length > 1 && (
        <nav className="mt-6 flex gap-1 border-b border-line" aria-label="Cómo agregar invitados">
          {tabs.map((item) => (
            <Link
              key={item.key}
              href={item.key === "lista" ? `/eventos/${event.id}/invitados` : `/eventos/${event.id}/invitados?tab=${item.key}`}
              aria-current={item.key === tab ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2.5 text-[0.92rem] transition-colors ${
                item.key === tab ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      {tab === "lista" && (
        <>
          {!archived && (
            <p className="mt-4 text-[0.88rem] leading-relaxed text-ink-muted">
              Agrega a alguien con «Agregar invitado», o trae a muchos desde{" "}
              <Link href={`/eventos/${event.id}/invitados?tab=importar`} className="text-accent hover:underline">
                Importar
              </Link>{" "}
              y{" "}
              <Link href={`/eventos/${event.id}/invitados?tab=otras`} className="text-accent hover:underline">
                Otras formas
              </Link>
              . {NOTHING_SENT}
            </p>
          )}

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
        </>
      )}

      {tab === "importar" && (
        <div className="mt-8 max-w-3xl">
          <ImportWay eventId={event.id} />
        </div>
      )}

      {tab === "otras" && ways && (
        <div className="mt-8 max-w-3xl space-y-5">
          <p className="text-[0.88rem] leading-relaxed text-ink-muted">
            Puedes combinarlas y cambiar de opinión cuando quieras. {NOTHING_SENT}
          </p>
          <RegistrationWay eventId={event.id} registration={ways.registration} canToggle={can(access, "event")} />
          <ContactsWay contacts={ways.contacts} />
          <OneByOneWay
            where={
              <>
                En la pestaña{" "}
                <Link href={`/eventos/${event.id}/invitados`} className="text-accent hover:underline">
                  Lista
                </Link>{" "}
                → «Agregar invitado»,
              </>
            }
          />
        </div>
      )}

      {tab !== "otras" && (
        <p className="mt-8 text-[0.85rem] leading-relaxed text-ink-muted">
          Los números se guardan en formato internacional. Reconocemos las formas
          antiguas mexicanas (+52 1…, 044, 045) y detectamos repetidos aunque
          estén escritos distinto.
        </p>
      )}
    </div>
  );
}
