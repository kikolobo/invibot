import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { db } from "@/db";
import { events } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { previewNotifyAudience } from "@/lib/events/notify";
import { EditForm } from "./edit-form";

export const metadata = { title: "Editar evento" };

export default async function Editar({
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
        Si cambias algo que tus invitados necesitan saber, te preguntamos si quieres
        avisarles.
      </p>

      <div className="mt-8">
        <EditForm
          eventId={event.id}
          event={{
            name: event.name,
            hostNames: event.hostNames,
            venueName: event.venueName,
            venueAddress: event.venueAddress,
            venueState: event.venueState,
            venueCountry: event.venueCountry,
            venueMapsUrl: event.venueMapsUrl,
            venueCity: event.venueCity,
            rsvpRequired: event.rsvpRequired,
            allowPlusOnes: event.allowPlusOnes,
            qrEnabled: event.qrEnabled,
          }}
          date={`${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`}
          time={`${pad(local.getHours())}:${pad(local.getMinutes())}`}
          audience={audience}
        />
      </div>
    </div>
  );
}
