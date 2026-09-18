import Link from "next/link";
import { notFound } from "next/navigation";
import { countryLabel } from "@/lib/events/places";
import { eventMapsEmbedUrl, eventMapsUrl } from "@/lib/events/maps";
import { and, count, eq, ne } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { db } from "@/db";
import { events, guests } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { eventKindLabels } from "@/lib/events/kinds";
import { r2FromEnv } from "@/lib/storage/r2";
import { registrationLink } from "@/lib/guests/auto-register";
import { uploadCard, removeCard, uploadTeaser, removeTeaser } from "@/lib/events/card";
import { EventImage } from "./event-image";
import { AutoRegister } from "./auto-register";
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

  // Only for the badge on the panel; the list itself lives in Invitados.
  const [{ pendingCount }] = await db
    .select({ pendingCount: count() })
    .from(guests)
    .where(and(eq(guests.eventId, id), eq(guests.approvalStatus, "pending")));

  const archived = event.archivedAt !== null;
  const storageReady = r2FromEnv() !== null;

  const mapsEmbed = eventMapsEmbedUrl(event);
  const mapsLink = eventMapsUrl(event);

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
              {mapsLink && (
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[0.85rem] text-accent hover:underline"
                >
                  Cómo llegar
                </a>
              )}
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

        {mapsEmbed && (
          <div className="mt-6 overflow-hidden rounded-xl border border-line">
            <iframe
              src={mapsEmbed}
              title="Mapa del lugar"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="block h-64 w-full border-0"
            />
            <p className="border-t border-line bg-paper-deep px-4 py-2 text-[0.8rem] text-ink-muted">
              {event.venueLat && event.venueLng
                ? "Cuando un invitado pregunte dónde es, el asistente le manda este punto como mapa de WhatsApp."
                : "No pudimos ubicar el punto exacto. El asistente les mandará el link en vez del mapa; pega el link de «Compartir» de Google Maps para afinarlo."}
            </p>
          </div>
        )}


        {!archived && (
          <AutoRegister
            eventId={event.id}
            enabled={event.autoRegisterEnabled}
            link={registrationLink(event)}
            pendingCount={pendingCount}
          />
        )}

        {!archived && (
          <EventImage
            eventId={event.id}
            field="card"
            endpoint={`/api/eventos/${event.id}/card`}
            title="La invitación"
            intro="Sube la imagen de tu invitación. Se la mandamos a cada invitado justo después de que confirme, sin costo extra."
            hasImage={Boolean(event.cardR2Key)}
            bytes={event.cardBytes}
            uploadedAt={event.cardUploadedAt}
            storageReady={storageReady}
            upload={uploadCard}
            remove={removeCard}
            footnote={
              invitedCount > 0 && !event.cardR2Key ? (
                <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-muted">
                  Ya enviaste {invitedCount}{" "}
                  {invitedCount === 1 ? "invitación" : "invitaciones"}. Quien haya confirmado
                  hace más de un día ya no puede recibir la imagen — WhatsApp solo nos deja
                  mandarla dentro de las 24 horas siguientes a su mensaje.
                </p>
              ) : null
            }
          />
        )}

        {!archived && (
          <EventImage
            eventId={event.id}
            field="teaser"
            endpoint={`/api/eventos/${event.id}/teaser`}
            title="El teaser «Save the Date»"
            intro="Una segunda imagen, aparte de la invitación. Es la que aparece en WhatsApp cuando alguien comparte tu liga de autorregistro."
            hasImage={Boolean(event.teaserR2Key)}
            bytes={event.teaserBytes}
            uploadedAt={event.teaserUploadedAt}
            storageReady={storageReady}
            upload={uploadTeaser}
            remove={removeTeaser}
            notice={
              <div className="mt-4 rounded-xl border border-accent/40 bg-paper-deep p-4">
                <p className="text-[0.88rem] font-medium text-ink">
                  Esta imagen es pública. Trátala como un cartel en la calle.
                </p>
                <p className="mt-1 text-[0.85rem] leading-relaxed text-ink-muted">
                  Aparece al compartir la liga, y una liga se reenvía: la va a ver gente que
                  no invitaste y gente a la que ellos se la pasen.{" "}
                  <strong className="font-medium text-ink-soft">
                    No pongas aquí la dirección, el mapa, tu teléfono ni nada que no quieras
                    que circule.
                  </strong>{" "}
                  Para eso está la invitación de arriba, que sólo llega a quien ya confirmó.
                </p>
              </div>
            }
            footnote={
              <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-muted">
                La achicamos al subirla: WhatsApp no muestra la vista previa si la imagen
                pesa demasiado, y no avisa cuando decide no mostrarla.
              </p>
            }
          />
        )}




      </div>
    </>
  );
}
