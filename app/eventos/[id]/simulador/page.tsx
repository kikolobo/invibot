import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guests } from "@/db/schema";
import { requireEventAccess } from "@/lib/events/access";
import { eventVariables, missingForInvitation, greetingName } from "@/lib/campaigns/recipients";
import { missingLabels } from "@/lib/campaigns/labels";
import { formatEventWhere } from "@/lib/events/format";
import { guestMapsLink } from "@/lib/events/maps";
import { WhatsAppPreview } from "../whatsapp-preview";
import { AgentChat } from "../agent-chat";
import { assistantName } from "@/lib/agent/identity";

export const metadata = { title: "Simulador de WhatsApp" };

export default async function Simulador({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { event } = await requireEventAccess(id, "event");

  const missing = missingForInvitation(event);

  // A real guest's name where there is one: seeing the message addressed to
  // someone on the actual list is the point of a preview.
  const sampleGuest = await db.query.guests.findFirst({ where: eq(guests.eventId, id) });
  const previewName = sampleGuest ? greetingName(sampleGuest) : "María";

  return (
    <div>
      <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
        Simulador de WhatsApp
      </h1>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
        Esto es exactamente lo que enviamos, palabra por palabra. Toca una respuesta
        para ver qué recibe después.
      </p>

      {missing.length > 0 ? (
        // Refusing to draw something is the honest answer here: with a slot
        // empty the invitation cannot be sent either, and a preview that fills
        // the gap invents a message that will never exist.
        <p className="mt-8 rounded-xl border border-dashed border-line bg-paper-deep p-6 leading-relaxed text-ink-muted">
          Todavía no podemos mostrarte la invitación: falta{" "}
          <span className="text-ink">
            {missing.map((field) => missingLabels[field]).join(" y ")}
          </span>
          . Es lo mismo que impide enviarla.{" "}
          {event.archivedAt === null && (
            <Link href={`/eventos/${event.id}`} className="text-accent hover:underline">
              Complétalo en el resumen
            </Link>
          )}
        </p>
      ) : (
        <div className="mt-8">
          <WhatsAppPreview
            assistant={assistantName()}
            eventName={event.name}
            eventVars={eventVariables(event)}
            guestName={previewName}
            where={formatEventWhere(event)}
            mapsUrl={guestMapsLink(event)}
            withCompanion={event.maxPartySize > 1}
            cardSrc={
              event.cardR2Key
                ? `/api/eventos/${event.id}/card?v=${event.cardUploadedAt?.getTime() ?? 0}`
                : null
            }
          />
        </div>
      )}

      <AgentChat eventId={event.id} eventName={event.name} />
    </div>
  );
}
