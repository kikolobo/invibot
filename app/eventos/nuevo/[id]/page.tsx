import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizers, users } from "@/db/schema";
import { waysToAdd } from "@/lib/guests/ways";
import { requireOrg } from "@/lib/auth/session";
import { requireEventAccess } from "@/lib/events/access";
import { wallClock } from "@/lib/events/zones";
import { deadlineDate } from "@/lib/events/rsvp-deadline";
import { formatPhone } from "@/lib/phone";
import { StepFive, StepFour, StepOne, StepThree, StepTwo } from "../wizard";

export const metadata = { title: "Nuevo evento" };

/**
 * Steps two to five of the wizard, on an event that already exists — and step
 * one again, when somebody goes back to it. Outside /eventos/[id] on purpose:
 * the event's menu would be a dozen ways out of a flow that wants one.
 */
export default async function PasoDelEvento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paso?: string }>;
}) {
  const { id } = await params;
  const { event } = await requireEventAccess(id, "event");
  if (event.archivedAt) redirect(`/eventos/${event.id}`);
  const step = Number((await searchParams).paso ?? 2);

  if (step === 1) {
    const { date, time } = wallClock(event.startsAt, event.timezone);
    return (
      <StepOne
        eventId={event.id}
        firstName={null}
        defaults={{ kind: event.kind, name: event.name, date, time }}
      />
    );
  }

  if (step === 3) {
    const placed = Boolean(
      event.venueName || event.venueAddress || event.venuePostalCode || event.venueCity || event.venueState || event.venueMapsUrl,
    );
    return (
      <StepThree
        eventId={event.id}
        defaults={{
          venueName: event.venueName ?? "",
          venueAddress: event.venueAddress ?? "",
          venuePostalCode: event.venuePostalCode ?? "",
          venueCity: event.venueCity ?? "",
          venueState: event.venueState ?? "",
          venueCountry: event.venueCountry ?? "MX",
          venueMapsUrl: event.venueMapsUrl ?? "",
          timezone: event.timezone,
          timezoneSet: placed || event.timezone !== "America/Mexico_City",
        }}
      />
    );
  }

  if (step === 4) {
    return (
      <StepFour
        eventId={event.id}
        defaults={{
          rsvpRequired: event.rsvpRequired,
          allowPlusOnes: event.allowPlusOnes,
          qrEnabled: event.qrEnabled,
          reminderDaysBefore: event.reminderDaysBefore,
          rsvpDeadline: deadlineDate(event.rsvpDeadline, event.timezone),
          eventDate: wallClock(event.startsAt, event.timezone).date,
        }}
      />
    );
  }

  if (step === 5) {
    const { userId } = await requireOrg();
    return <StepFive eventId={event.id} ways={await waysToAdd(event, userId)} />;
  }

  // Whoever answers today; on a new event that is the owner, added from their
  // account. An account from before signup asked for a phone has no row yet,
  // so the form starts from the account itself.
  const { userId, name } = await requireOrg();
  const responder = await db.query.organizers.findFirst({
    where: and(eq(organizers.eventId, event.id), eq(organizers.isResponder, true)),
    columns: { fullName: true, phoneE164: true },
  });
  const account = responder
    ? null
    : await db.query.users.findFirst({ where: eq(users.id, userId), columns: { phone: true } });
  const phone = responder?.phoneE164 ?? account?.phone ?? null;

  return (
    <StepTwo
      eventId={event.id}
      defaults={{
        hostNames: event.hostNames ?? "",
        responderName: responder?.fullName ?? name ?? "",
        responderPhone: phone ? formatPhone(phone) : "",
      }}
    />
  );
}
