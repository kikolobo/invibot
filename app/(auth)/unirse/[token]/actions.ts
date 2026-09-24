"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { variantsOf } from "@/lib/phone";
import { INVITE_COOKIE, acceptInvite, inviteByToken } from "@/lib/organizers/invites";

/**
 * Holding the invitation for the signup that follows.
 *
 * The signup itself goes to better-auth's endpoint, which cannot be handed the
 * token as an argument; its create hook reads this cookie instead, and only
 * lets the account through for the number the invitation was sent to.
 */
export async function holdInvite(token: string): Promise<{ error?: string }> {
  if (!(await inviteByToken(token))) return { error: "Esta invitación ya no está disponible." };

  const jar = await cookies();
  jar.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
  return {};
}

/**
 * Accepting with an account that already exists.
 *
 * Tied to the number, like the signup: the link was sent to one WhatsApp, and
 * somebody it was forwarded to should not walk into the guest list with it.
 * An account with no number yet is the exception — it takes this one.
 */
export async function joinWithAccount(token: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session?.user) return { error: "Entra a tu cuenta primero." };

  const found = await inviteByToken(token);
  if (!found) return { error: "Esta invitación ya no está disponible." };

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, name: true, email: true, phone: true },
  });
  if (!user) return { error: "Entra a tu cuenta primero." };

  if (user.phone && !variantsOf(user.phone).includes(found.invite.phoneE164)) {
    return {
      error:
        "Esta invitación es para otro número de WhatsApp. Pide que te inviten con el número de tu cuenta.",
    };
  }

  await acceptInvite(found.invite, user);
  redirect(`/eventos/${found.event.id}`);
}
