import { SiteShell } from "@/components/site-chrome";
import { getSession } from "@/lib/auth/session";
import { roleLabels } from "@/lib/events/access";
import { inviteByToken } from "@/lib/organizers/invites";
import { formatPhone } from "@/lib/phone";
import { JoinForm } from "./join-form";

export const metadata = { title: "Únete al evento" };

/**
 * Where an invitation link lands.
 *
 * Three people arrive here: somebody new, who signs up without the beta
 * passcode because the invitation is the pass; somebody with an account, who
 * signs in and accepts; and somebody whose link was revoked or already used.
 */
export default async function Unirse({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await inviteByToken(token);
  const session = await getSession();

  return (
    <SiteShell tone="paper">
      <div className="mx-auto max-w-md px-6 py-16 sm:px-10">
        {!found ? (
          <>
            <h1 className="font-display text-4xl leading-tight text-ink">Invitación no disponible</h1>
            <p className="mt-3 leading-relaxed text-ink-soft">
              Esta liga ya se usó o la retiraron. Pídele a quien te invitó que te mande una nueva.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-4xl leading-tight text-ink">Únete a {found.event.name}</h1>
            <p className="mt-3 leading-relaxed text-ink-soft">
              Te invitaron como{" "}
              <span className="text-ink">
                {roleLabels[found.invite.role === "admin" ? "admin" : "guest_manager"]}
              </span>
              . La invitación es para el WhatsApp {formatPhone(found.invite.phoneE164)}.
            </p>
            <JoinForm
              token={token}
              eventId={found.event.id}
              signedInAs={session?.user.email ?? null}
              name={found.invite.fullName}
              phone={formatPhone(found.invite.phoneE164)}
            />
          </>
        )}
      </div>
    </SiteShell>
  );
}
