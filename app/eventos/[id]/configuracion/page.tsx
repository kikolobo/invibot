import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { guests } from "@/db/schema";
import { requireEventAccess } from "@/lib/events/access";
import { registrationLink } from "@/lib/guests/auto-register";
import { deadlineDate } from "@/lib/events/rsvp-deadline";
import { wallClock } from "@/lib/events/zones";
import { AutoRegister } from "../auto-register";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Configuración" };

/**
 * The decisions about how guests are received, in one place: confirmations,
 * reminders, the QR pass and the registration link. What the invitation says
 * lives in Generales; what Aura knows, in Detalles.
 */
export default async function Configuracion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await requireEventAccess(id, "event");
  if (event.archivedAt) redirect(`/eventos/${event.id}`);

  const [{ pendingCount }] = await db
    .select({ pendingCount: count() })
    .from(guests)
    .where(and(eq(guests.eventId, id), eq(guests.approvalStatus, "pending")));

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-4xl leading-tight text-ink sm:text-5xl">Configuración</h1>
      <p className="mt-4 max-w-prose leading-relaxed text-ink-soft">
        Cómo recibes a tus invitados. Puedes cambiarlo cuando quieras; nada de esto se les avisa.
      </p>

      <div className="mt-8">
        <SettingsForm
          eventId={event.id}
          settings={{
            rsvpRequired: event.rsvpRequired,
            allowPlusOnes: event.allowPlusOnes,
            qrEnabled: event.qrEnabled,
            reminderDaysBefore: event.reminderDaysBefore,
            rsvpDeadline: deadlineDate(event.rsvpDeadline, event.timezone),
          }}
          eventDate={wallClock(event.startsAt, event.timezone).date}
        />
      </div>

      {/* Its own switch, saved the moment it flips: turning it off asks first. */}
      <AutoRegister
        eventId={event.id}
        enabled={event.autoRegisterEnabled}
        link={registrationLink(event)}
        pendingCount={pendingCount}
        className="mt-10"
      />
    </div>
  );
}
