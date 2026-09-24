import { asc, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizerInvites, organizers } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { requireEventAccess } from "@/lib/events/access";
import { ensureOwner } from "@/lib/organizers/owner";
import { inviteLink, inviteMessage } from "@/lib/organizers/invites";
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
  const { userId, name: viewerName } = await requireOrg();
  const { event, role } = await requireEventAccess(id, "team");

  // Adding and removing are blocked on an archived event anyway, so there is
  // nothing to do here but look at a form that refuses.
  if (event.archivedAt) redirect(`/eventos/${event.id}`);

  // Events from before the owner was put there for them catch up here, the
  // first time anybody looks.
  const ownerListed = await ensureOwner(event.id);

  const team = await db
    .select({
      id: organizers.id,
      fullName: organizers.fullName,
      phoneE164: organizers.phoneE164,
      isResponder: organizers.isResponder,
      isOwner: organizers.isOwner,
      role: organizers.role,
      userId: organizers.userId,
    })
    .from(organizers)
    .where(eq(organizers.eventId, event.id))
    .orderBy(desc(organizers.isOwner), asc(organizers.createdAt));

  const pending = await db
    .select()
    .from(organizerInvites)
    .where(eq(organizerInvites.eventId, event.id))
    .orderBy(asc(organizerInvites.createdAt));

  return (
    <>
      <h1 className="font-display text-3xl text-ink">Organizadores</h1>
      <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-ink-muted">
        Quienes organizan este evento contigo. Cada quien entra con su propia cuenta de
        Invibot; si alguien no tiene, le mandamos una invitación a su WhatsApp. El dueño
        siempre está en la lista.
      </p>

      <Organizadores
        eventId={event.id}
        rows={team.map(({ userId: rowUser, ...row }) => ({
          ...row,
          hasAccount: rowUser !== null,
          isYou: row.isOwner ? role === "owner" : rowUser === userId,
        }))}
        invites={pending.map((invite) => {
          const link = inviteLink(invite.token);
          return {
            id: invite.id,
            fullName: invite.fullName,
            phoneE164: invite.phoneE164,
            role: invite.role === "admin" ? "admin" : "guest_manager",
            link,
            // Signed by whoever is looking: it goes out from their WhatsApp.
            message: inviteMessage({
              invitee: invite.fullName,
              inviter: viewerName,
              eventName: event.name,
              link,
            }),
            sentAt: invite.sentAt?.toISOString() ?? null,
          };
        })}
        staffCode={event.staffCode}
        ownerListed={ownerListed}
        viewerIsOwner={role === "owner"}
      />
    </>
  );
}
