import { and, asc, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { events, guests } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { registrationLink } from "@/lib/guests/auto-register";
import { listGroups } from "@/lib/guests/actions";
import { ApprovalQueue, type PendingGuest } from "./approval-queue";

export const metadata = { title: "Aprobaciones" };

/**
 * Who asked to come, and has not been let in yet.
 *
 * Its own section rather than a panel inside Invitados: these people are not
 * guests, and mixing them into that list would make every count there mean two
 * things at once. Approving moves them across.
 */
export default async function Aprobaciones({
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

  const awaiting = await db
    .select({
      id: guests.id,
      fullName: guests.fullName,
      phoneE164: guests.phoneE164,
      notes: guests.notes,
      createdAt: guests.createdAt,
      approvalStatus: guests.approvalStatus,
    })
    .from(guests)
    .where(and(eq(guests.eventId, id), ne(guests.approvalStatus, "approved")))
    .orderBy(asc(guests.createdAt));

  const pending = awaiting.filter((g) => g.approvalStatus === "pending") as PendingGuest[];
  const rejected = awaiting.filter((g) => g.approvalStatus === "rejected") as PendingGuest[];
  const link = registrationLink(event);
  const groups = await listGroups(event.id);

  return (
    <>
      <h1 className="font-display text-3xl text-ink">Aprobaciones</h1>
      <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-ink-muted">
        Quien abre tu liga de autorregistro aparece aquí. No recibe invitación ni puede
        confirmar hasta que lo apruebes; al aprobarlo pasa a Invitados.
      </p>

      {!event.autoRegisterEnabled && pending.length === 0 && rejected.length === 0 && (
        <p className="mt-8 rounded-xl border border-line bg-paper-deep p-5 text-[0.88rem] leading-relaxed text-ink-muted">
          El autorregistro está apagado para este evento. Puedes prenderlo en Generales y
          compartir la liga en tus grupos.
        </p>
      )}

      {event.autoRegisterEnabled && pending.length === 0 && rejected.length === 0 && (
        <div className="mt-8 rounded-xl border border-line bg-paper-deep p-5">
          <p className="text-[0.88rem] leading-relaxed text-ink-muted">
            Todavía no se registra nadie. Comparte tu liga:
          </p>
          {link && (
            <code className="mt-3 block truncate rounded-lg border border-line bg-paper px-3 py-2 text-[0.82rem] text-ink-soft">
              {link}
            </code>
          )}
        </div>
      )}

      <ApprovalQueue
        eventId={event.id}
        pending={pending}
        rejected={rejected}
        groups={groups}
      />
    </>
  );
}
