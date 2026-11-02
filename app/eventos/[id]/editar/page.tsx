import Link from "next/link";
import { redirect } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { requireEventAccess } from "@/lib/events/access";
import { previewNotifyAudience } from "@/lib/events/notify";
import { EditForm } from "./edit-form";

export const metadata = { title: "Editar evento" };

export default async function Editar({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { event } = await requireEventAccess(id, "event");
  if (event.archivedAt) redirect(`/eventos/${event.id}`);

  // Rendered in the event's own timezone so the form shows the hour the
  // organizer meant, not the server's idea of it.
  const local = new TZDate(event.startsAt, event.timezone);
  const pad = (n: number) => String(n).padStart(2, "0");

  const audience = await previewNotifyAudience(id);

  return (
    <div>
      <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
        Editar evento
      </h1>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
        Lo que dice tu invitación: nombre, quién invita, fecha y lugar. Si cambias algo que
        tus invitados necesitan saber, te preguntamos si quieres avisarles.
      </p>
      <p className="mt-2 max-w-prose text-[0.88rem] leading-relaxed text-ink-muted">
        Confirmaciones, acompañantes, recordatorios, QR y autorregistro están en{" "}
        <Link href={`/eventos/${event.id}/configuracion`} className="text-accent hover:underline">
          Configuración
        </Link>
        .
      </p>

      <div className="mt-8">
        <EditForm
          eventId={event.id}
          event={{
            name: event.name,
            hostNames: event.hostNames,
            venueName: event.venueName,
            venueAddress: event.venueAddress,
            venuePostalCode: event.venuePostalCode,
            venueState: event.venueState,
            venueCountry: event.venueCountry,
            venueMapsUrl: event.venueMapsUrl,
            venueCity: event.venueCity,
          }}
          date={`${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`}
          time={`${pad(local.getHours())}:${pad(local.getMinutes())}`}
          audience={audience}
        />
      </div>
    </div>
  );
}
