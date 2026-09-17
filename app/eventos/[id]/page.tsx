import Link from "next/link";
import { notFound } from "next/navigation";
import { countryLabel } from "@/lib/events/places";
import { and, count, eq, ne } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { db } from "@/db";
import { events, guests } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { eventKindLabels } from "@/lib/events/kinds";
import { r2FromEnv } from "@/lib/storage/r2";
import { EventCard } from "./event-card";
import { ArchiveEvent } from "./archive-event";

export const metadata = { title: "Evento" };

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" });

/**
 * Where the event is, in words an organizer can act on.
 *
 * "Borrador" was the first label and it reads as "borrado" at a glance — the
 * wrong word entirely for an event whose invitations simply have not gone out.
 */
const statusLabels: Record<string, string> = {
  draft: "Sin enviar",
  ready: "Lista para enviar",
  sending: "Enviando",
  live: "Invitaciones enviadas",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

export default async function EventoPage({
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

  const [{ guestCount }] = await db
    .select({ guestCount: count() })
    .from(guests)
    .where(eq(guests.eventId, id));

  // Only to warn that changing companions does not reach invitations already sent.
  const [{ invitedCount }] = await db
    .select({ invitedCount: count() })
    .from(guests)
    .where(and(eq(guests.eventId, id), ne(guests.inviteStatus, "pending")));

  const archived = event.archivedAt !== null;

  // City, state and country read as one line; any of them may be missing.
  const where = [event.venueCity, event.venueState, countryLabel(event.venueCountry)]
    .filter(Boolean)
    .join(", ");

  // Render the date in the event's own timezone, not the server's.
  const local = new TZDate(event.startsAt, event.timezone);

  return (
    <>
      <div>
        <p className="eyebrow">{eventKindLabels[event.kind].es}</p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
          {event.name}
        </h1>
        {event.hostNames && (
          <p className="mt-2 text-lg text-ink-soft">Invita: {event.hostNames}</p>
        )}

        {archived && (
          <ArchiveEvent eventId={event.id} archived guestCount={guestCount} />
        )}

        <dl className="mt-8 grid gap-x-8 gap-y-4 border-y border-line py-6 sm:grid-cols-2">
          <div>
            <dt className="eyebrow">Cuándo</dt>
            <dd className="mt-1 text-ink first-letter:uppercase">
              {dateFmt.format(local)}
              <span className="text-ink-soft"> · {timeFmt.format(local)}</span>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Dónde</dt>
            <dd className="mt-1 text-ink">
              {event.venueName ?? "Sin definir"}
              {where && <span className="block text-[0.9rem] text-ink-soft">{where}</span>}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Confirmación</dt>
            <dd className="mt-1 text-ink">
              {event.rsvpRequired ? "Requerida" : "No se pide"}
              {event.maxPartySize > 1 && (
                <span className="text-ink-soft"> · con acompañante</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Estado</dt>
            <dd className="mt-1 text-ink">
              {archived ? "Archivado" : statusLabels[event.status]}
            </dd>
          </div>
        </dl>

        {!archived && (
          <Link
            href={`/eventos/${event.id}/editar`}
            className="mt-4 inline-flex items-center rounded-full border border-line px-4 py-1.5 text-[0.85rem] text-ink-soft transition-colors hover:border-accent hover:text-accent"
          >
            Editar evento
          </Link>
        )}


        {!archived && (
          <EventCard
            eventId={event.id}
            hasCard={Boolean(event.cardR2Key)}
            bytes={event.cardBytes}
            uploadedAt={event.cardUploadedAt}
            storageReady={r2FromEnv() !== null}
            invitedCount={invitedCount}
          />
        )}




      </div>
    </>
  );
}
