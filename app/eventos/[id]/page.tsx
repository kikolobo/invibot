import Link from "next/link";
import { countryLabel } from "@/lib/events/places";
import { eventMapsEmbedUrl, eventMapsUrl } from "@/lib/events/maps";
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { guests } from "@/db/schema";
import { requireEventAccess } from "@/lib/events/access";
import { eventKindLabels } from "@/lib/events/kinds";
import { r2FromEnv } from "@/lib/storage/r2";
import { uploadCard, removeCard, uploadTeaser, removeTeaser } from "@/lib/events/card";
import { EventImage } from "./event-image";
import { ArchiveEvent } from "./archive-event";

export const metadata = { title: "Evento" };

// Built per render with the event's own timeZone. Without that option Intl
// formats in the runtime's zone, which on Vercel is UTC — the same bug that
// told guests a Saturday-night party was on Sunday.
const dateFmtFor = (timeZone: string) =>
  new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  });
const timeFmtFor = (timeZone: string) =>
  new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone });

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

const TABS = [
  { key: "datos", label: "Datos" },
  { key: "imagenes", label: "Imágenes" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function EventoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: requested } = await searchParams;
  const { event } = await requireEventAccess(id, "event");

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
  // An archived event's images cannot change, so it shows its data alone.
  const tab: Tab = !archived && requested === "imagenes" ? "imagenes" : "datos";
  const storageReady = r2FromEnv() !== null;

  const mapsEmbed = eventMapsEmbedUrl(event);
  const mapsLink = eventMapsUrl(event);

  // City, state and country read as one line; any of them may be missing.
  const where = [event.venueCity, event.venueState, countryLabel(event.venueCountry)]
    .filter(Boolean)
    .join(", ");

  const showDate = dateFmtFor(event.timezone);
  const showTime = timeFmtFor(event.timezone);

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

        {!archived && (
          <nav className="mt-8 flex gap-1 border-b border-line" aria-label="Secciones">
            {TABS.map((item) => (
              <Link
                key={item.key}
                href={item.key === "datos" ? `/eventos/${event.id}` : `/eventos/${event.id}?tab=${item.key}`}
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

        {tab === "datos" && (
        <>
        {/* Under the tabs their own rule is the top edge; archived, there are no tabs. */}
        <dl
          className={`grid gap-x-8 gap-y-4 border-b border-line py-6 sm:grid-cols-2 ${
            archived ? "mt-8 border-t" : "mt-2"
          }`}
        >
          <div>
            <dt className="eyebrow">Cuándo</dt>
            <dd className="mt-1 text-ink first-letter:uppercase">
              {showDate.format(event.startsAt)}
              <span className="text-ink-soft"> · {showTime.format(event.startsAt)}</span>
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


        <p className="mt-6 text-[0.88rem] leading-relaxed text-ink-muted">
          Las imágenes de tu invitación están en{" "}
          <Link href={`/eventos/${event.id}?tab=imagenes`} className="text-accent hover:underline">
            Imágenes
          </Link>
          ; cómo recibes a tus invitados (confirmaciones, QR, autorregistro), en{" "}
          <Link href={`/eventos/${event.id}/configuracion`} className="text-accent hover:underline">
            Configuración
          </Link>
          .
        </p>
        </>
        )}

        {tab === "imagenes" && (
          <div className="mt-8 space-y-12">
            <p className="text-[0.9rem] leading-relaxed text-ink-soft">
              ¿Quieres ver cómo le llega todo a tu invitado?{" "}
              <Link href={`/eventos/${event.id}/simulador`} className="text-accent hover:underline">
                Pruébalo en el Simulador WhatsApp →
              </Link>
            </p>

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
              notice={
                // Deliberately a quieter border than the teaser's. The pair reads
                // as one comparison, but only one of them is a warning: this card
                // says what is safe, and shouting it would dull the one next to
                // it that says what is not.
                <div className="mt-4 rounded-xl border border-line bg-paper-deep p-4">
                  <p key="n1" className="text-[0.88rem] font-medium text-ink">
                    Esta imagen es privada. Aquí sí va todo.
                  </p>
                  <p key="n2" className="mt-1 text-[0.85rem] leading-relaxed text-ink-muted">
                    Le llega a cada invitado en el momento en que confirma, y a nadie más. No
                    se publica en ningún lado, así que puede llevar la dirección, la hora y los
                    nombres sin problema. El teaser, más abajo, es el que ve cualquiera que
                    abra tu liga.
                  </p>
                </div>
              }
              footnote={
                invitedCount > 0 && !event.cardR2Key ? (
                  <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-muted">
                    {`Ya enviaste ${invitedCount} ${
                      invitedCount === 1 ? "invitación" : "invitaciones"
                    }. Quien haya confirmado hace más de un día ya no puede recibir la imagen — WhatsApp solo nos deja mandarla dentro de las 24 horas siguientes a su mensaje.`}
                  </p>
                ) : null
              }
            />

            <EventImage
              eventId={event.id}
              field="teaser"
              endpoint={`/api/eventos/${event.id}/teaser`}
              title="El teaser «Save the Date»"
              intro="Opcional, y sólo si usas el autorregistro: es la imagen que aparece en WhatsApp cuando compartes tu liga en un grupo."
              hasImage={Boolean(event.teaserR2Key)}
              bytes={event.teaserBytes}
              uploadedAt={event.teaserUploadedAt}
              storageReady={storageReady}
              upload={uploadTeaser}
              remove={removeTeaser}
              notice={
                <div className="mt-4 rounded-xl border border-accent/40 bg-paper-deep p-4">
                  <p key="n3" className="text-[0.88rem] font-medium text-ink">
                    Esta imagen es pública. Trátala como un cartel en la calle.
                  </p>
                  <p key="n4" className="mt-1 text-[0.85rem] leading-relaxed text-ink-muted">
                    Aparece al compartir la liga, y una liga se reenvía: la va a ver gente que
                    no invitaste y gente a la que ellos se la pasen.
                  </p>
                  <p key="n5" className="mt-1 text-[0.85rem] font-medium leading-relaxed text-ink-soft">
                    No pongas aquí la dirección, el mapa, tu teléfono ni nada que no quieras
                    que circule.
                  </p>
                  <p key="n6" className="mt-1 text-[0.85rem] leading-relaxed text-ink-muted">
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
          </div>
        )}
      </div>
    </>
  );
}
