import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { events, organizers } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { Organizadores } from "./organizadores";

export const metadata = { title: "Organizadores" };

/**
 * The people running the event, on their own page.
 *
 * It lived at the bottom of Detalles, which is a long questionnaire answered
 * over days — the wrong neighbourhood for a short list you set up once and
 * then forget. Who is on your team is not one of the things your guests are
 * going to ask about.
 */
export default async function OrganizadoresPage({
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

  // Adding and removing are blocked on an archived event anyway, so there is
  // nothing to do here but look at a form that refuses.
  if (event.archivedAt) redirect(`/eventos/${event.id}`);

  const team = await db
    .select({
      id: organizers.id,
      fullName: organizers.fullName,
      phoneE164: organizers.phoneE164,
      isResponder: organizers.isResponder,
    })
    .from(organizers)
    .where(eq(organizers.eventId, event.id))
    .orderBy(asc(organizers.createdAt));

  return (
    <>
      <h1 className="font-display text-3xl text-ink">Organizadores</h1>
      <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-ink-muted">
        Quien te ayuda a organizar este evento. No necesitan cuenta: trabajan desde su
        WhatsApp.
      </p>

      <Organizadores eventId={event.id} rows={team} staffCode={event.staffCode} />
    </>
  );
}
