import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { organizations, organizerInvites, organizers, users, events } from "@/db/schema";
import { publicBase } from "@/lib/public-url";
import { variantsOf } from "@/lib/phone";
import { ensureStaffCode } from "./owner";
import { phoneTaken } from "./account-phone";

type InviteRow = typeof organizerInvites.$inferSelect;
export type InvitedRole = "admin" | "guest_manager";

export const INVITE_COOKIE = "invibot_invite";

export const newInviteToken = () => nanoid(32);

export const inviteLink = (token: string) => `${publicBase()}/unirse/${token}`;

/**
 * The text an owner sends from their own WhatsApp, when the bot cannot — or
 * when a message from a person they know is simply more likely to be opened.
 */
export function inviteMessage(values: {
  invitee: string;
  inviter: string;
  eventName: string;
  link: string;
}): string {
  return (
    `Hola ${values.invitee.split(/\s+/)[0]}, te invito a ayudarme a organizar ` +
    `${values.eventName} en Invibot. Crea tu cuenta o entra con esta liga:\n${values.link}`
  );
}

/** A pending invitation by its link, with the event it opens. */
export async function inviteByToken(token: string) {
  const [row] = await db
    .select({ invite: organizerInvites, event: events })
    .from(organizerInvites)
    .innerJoin(events, eq(events.id, organizerInvites.eventId))
    .where(eq(organizerInvites.token, token))
    .limit(1);
  return row ?? null;
}

/**
 * Turning a pending invitation into access, for this account.
 *
 * The account's own number wins when it has one, even if the invitation was
 * sent to another — the organizer row follows the account, since that is the
 * number they chose. An account from before signup asked for a number takes
 * the invitation's. Somebody already on the
 * list by phone keeps that row — and whether they answer guests — and gains
 * the account and the role.
 */
export async function acceptInvite(
  invite: InviteRow,
  user: { id: string; name: string; email: string; phone: string | null },
): Promise<void> {
  const phone = user.phone ?? invite.phoneE164;
  // An account with no number takes the invitation's — unless another account
  // already holds it, in which case this one simply stays without.
  if (!user.phone && !(await phoneTaken(phone, user.id))) {
    await db.update(users).set({ phone }).where(eq(users.id, user.id));
  }

  const [owner] = await db
    .select({ ownerUserId: organizations.ownerUserId })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.orgId))
    .where(eq(events.id, invite.eventId))
    .limit(1);

  // Inviting the owner to their own event: nothing to grant.
  if (owner?.ownerUserId !== user.id) {
    const team = await db
      .select({
        id: organizers.id,
        userId: organizers.userId,
        phoneE164: organizers.phoneE164,
        isOwner: organizers.isOwner,
      })
      .from(organizers)
      .where(eq(organizers.eventId, invite.eventId));

    const seat =
      team.find((row) => row.userId === user.id) ??
      team.find((row) => !row.isOwner && variantsOf(phone).includes(row.phoneE164));

    if (seat) {
      await db
        .update(organizers)
        .set({ userId: user.id, role: invite.role, updatedAt: new Date() })
        .where(eq(organizers.id, seat.id));
    } else {
      await db
        .insert(organizers)
        .values({
          eventId: invite.eventId,
          fullName: user.name || invite.fullName,
          phoneE164: phone,
          phoneVariants: variantsOf(phone),
          role: invite.role,
          userId: user.id,
          isResponder: team.length === 0,
        })
        .onConflictDoNothing();
    }
    await ensureStaffCode(invite.eventId);
  }

  await db.delete(organizerInvites).where(eq(organizerInvites.id, invite.id));
}

/**
 * Every invitation waiting on this number, accepted at once.
 *
 * Run when an account is created, so somebody who was invited and then signed
 * up by any route — the link, or the passcode — lands with the access that
 * was waiting for them.
 */
export async function acceptInvitesForPhone(user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}): Promise<void> {
  if (!user.phone) return;
  const waiting = await db
    .select()
    .from(organizerInvites)
    .where(inArray(organizerInvites.phoneE164, variantsOf(user.phone)));
  for (const invite of waiting) await acceptInvite(invite, user);
}

/** Whether this invitation may be used by somebody signing up with this number. */
export async function inviteOpensSignup(token: string, phoneE164: string): Promise<boolean> {
  const invite = await db.query.organizerInvites.findFirst({
    where: eq(organizerInvites.token, token),
    columns: { phoneE164: true },
  });
  return Boolean(invite && variantsOf(phoneE164).includes(invite.phoneE164));
}
