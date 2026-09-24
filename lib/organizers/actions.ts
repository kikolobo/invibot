"use server";

import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations, organizerInvites, organizers, users } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { editableEvent } from "@/lib/events/guard";
import { normalizePhone } from "@/lib/phone";
import { ensureOwner } from "./owner";
import { acceptInvite, inviteLink, inviteMessage, newInviteToken } from "./invites";
import { sendOrganizerInvite } from "./notify";

export type OrganizerState = { error?: string; ok?: string };

/**
 * Correcting somebody already on the list.
 *
 * A phone typed wrong is the whole failure: an organizador whose number is off
 * by a digit is silently not an organizador at all — their commands go
 * unanswered and a guest's question reaches a stranger's phone or nobody's.
 * Being unable to fix it without deleting and re-adding also loses whether
 * they were the responder.
 */
export async function updateOrganizer(
  eventId: string,
  organizerId: string,
  _prev: OrganizerState,
  formData: FormData,
): Promise<OrganizerState> {
  const { userId } = await requireOrg();
  const guard = await editableEvent(eventId, "team");
  if (!guard.ok) return { error: guard.error };

  const fullName = String(formData.get("fullName") ?? "").replace(/\s+/g, " ").trim();
  if (!fullName) return { error: "Falta el nombre." };

  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Ese teléfono no se ve bien. Revisa el número." };

  let updated: { isOwner: boolean } | undefined;
  try {
    [updated] = await db
      .update(organizers)
      .set({
        fullName,
        phoneE164: phone.e164,
        phoneVariants: phone.variants,
        updatedAt: new Date(),
      })
      .where(and(eq(organizers.eventId, eventId), eq(organizers.id, organizerId)))
      .returning({ isOwner: organizers.isOwner });
  } catch {
    return { error: "Ese teléfono ya está en la lista." };
  }

  // The owner's number is the account's number. Correcting it here and
  // nowhere else would put the old, wrong one on the next event they create.
  // Only the owner's own edit carries over: an admin fixing it for this event
  // does not get to rewrite somebody else's account.
  if (updated?.isOwner && guard.access.role === "owner") {
    await db.update(users).set({ phone: phone.e164 }).where(eq(users.id, userId));
  }

  revalidatePath(`/eventos/${eventId}/organizadores`);
  return { ok: "Guardado." };
}

/**
 * Moving who answers guests.
 *
 * Cleared then set, in that order: the database allows only one responder per
 * event, so setting before clearing would collide with the person being
 * replaced.
 */
export async function setResponder(eventId: string, organizerId: string): Promise<OrganizerState> {
  const guard = await editableEvent(eventId, "team");
  if (!guard.ok) return { error: guard.error };

  await db
    .update(organizers)
    .set({ isResponder: false, updatedAt: new Date() })
    .where(and(eq(organizers.eventId, eventId), ne(organizers.id, organizerId)));

  await db
    .update(organizers)
    .set({ isResponder: true, updatedAt: new Date() })
    .where(and(eq(organizers.eventId, eventId), eq(organizers.id, organizerId)));

  revalidatePath(`/eventos/${eventId}/organizadores`);
  return {};
}

/**
 * Removing somebody.
 *
 * If they were the one answering guests, the job passes back to the owner — or,
 * on an event whose owner has no number yet, to whoever has been on the list
 * longest. Leaving it empty would mean the next guest question reaches nobody,
 * and nothing would say so.
 *
 * The owner cannot be removed, and nobody can remove themselves. The buttons
 * are not shown, and these are the checks that matter.
 */
export async function removeOrganizer(
  eventId: string,
  organizerId: string,
): Promise<OrganizerState> {
  const guard = await editableEvent(eventId, "team");
  if (!guard.ok) return { error: guard.error };

  // Leaving is not something you do to yourself from here: an admin who
  // removed themselves by a slip would have to ask to be let back in.
  const { userId } = await requireOrg();
  const target = await db.query.organizers.findFirst({
    where: and(eq(organizers.eventId, eventId), eq(organizers.id, organizerId)),
    columns: { userId: true },
  });
  if (target?.userId && target.userId === userId) {
    return { error: "No puedes quitarte a ti mismo. Pídeselo al dueño o a un admin." };
  }

  const [removed] = await db
    .delete(organizers)
    .where(
      and(
        eq(organizers.eventId, eventId),
        eq(organizers.id, organizerId),
        eq(organizers.isOwner, false),
      ),
    )
    .returning({ wasResponder: organizers.isResponder });

  if (!removed) return { error: "Tú siempre estás en la lista de tus eventos." };

  if (removed.wasResponder) {
    const [next] = await db
      .select({ id: organizers.id })
      .from(organizers)
      .where(eq(organizers.eventId, eventId))
      .orderBy(desc(organizers.isOwner), asc(organizers.createdAt))
      .limit(1);

    if (next) {
      await db
        .update(organizers)
        .set({ isResponder: true, updatedAt: new Date() })
        .where(eq(organizers.id, next.id));
    }
  }

  revalidatePath(`/eventos/${eventId}/organizadores`);
  return {};
}

/**
 * The owner adding their own WhatsApp, on an account from before signup asked
 * for it.
 *
 * Saved to the account rather than only to this event, so every event after
 * this one puts them on the list without asking again.
 */
export async function addMyself(
  eventId: string,
  _prev: OrganizerState,
  formData: FormData,
): Promise<OrganizerState> {
  const { userId } = await requireOrg();
  const guard = await editableEvent(eventId, "team");
  if (!guard.ok) return { error: guard.error };
  if (guard.access.role !== "owner") return { error: "Sólo el dueño del evento puede hacer esto." };

  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Ese teléfono no se ve bien. Revisa el número." };

  await db.update(users).set({ phone: phone.e164 }).where(eq(users.id, userId));
  await ensureOwner(eventId);

  revalidatePath(`/eventos/${eventId}/organizadores`);
  return { ok: "Listo, ya estás en la lista." };
}

export type InvitedRole = "admin" | "guest_manager";
const invitedRoles: InvitedRole[] = ["admin", "guest_manager"];

export type InviteState = OrganizerState & {
  /** No account has this number: the form asks before sending anything. */
  confirm?: { name: string; phone: string };
  /** A fresh invitation, and whether our WhatsApp managed to deliver it. */
  invited?: { name: string; phone: string; link: string; message: string; sent: boolean };
};

/**
 * Giving somebody access to this event, by their WhatsApp number.
 *
 * An account with that number gets access at once. Without one, the form asks
 * first — "send them an invitation?" — and only the second submission, with
 * `confirm` set, creates it and sends it. The invitation goes out from our
 * number as a template; the link comes back too, for the owner to send from
 * their own WhatsApp, which also covers the template not being approved yet.
 */
export async function inviteOrganizer(
  eventId: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const guard = await editableEvent(eventId, "team");
  if (!guard.ok) return { error: guard.error };
  const { userId, name: inviterName } = await requireOrg();

  const fullName = String(formData.get("fullName") ?? "").replace(/\s+/g, " ").trim();
  if (!fullName) return { error: "Falta el nombre." };

  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Ese teléfono no se ve bien. Revisa el número." };

  const role = String(formData.get("role") ?? "") as InvitedRole;
  if (!invitedRoles.includes(role)) return { error: "Elige qué puede hacer." };

  const team = await db
    .select({ id: organizers.id, userId: organizers.userId, phoneE164: organizers.phoneE164 })
    .from(organizers)
    .where(eq(organizers.eventId, eventId));
  const pending = await db
    .select({ id: organizerInvites.id, phoneE164: organizerInvites.phoneE164 })
    .from(organizerInvites)
    .where(eq(organizerInvites.eventId, eventId));

  const account = await db.query.users.findFirst({
    where: inArray(users.phone, phone.variants),
    columns: { id: true, name: true, email: true, phone: true },
  });

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, guard.event.orgId),
    columns: { ownerUserId: true },
  });

  if (account) {
    if (org?.ownerUserId === account.id) return { error: "Ese número es del dueño del evento." };
    if (team.some((row) => row.userId === account.id)) {
      return { error: "Esa persona ya tiene acceso. Cambia su permiso en la lista." };
    }
    if (team.length + pending.length >= 10) {
      return { error: "Diez organizadores es el máximo por evento." };
    }

    // Straight to access: the same path an accepted invitation takes.
    const [invite] = await db
      .insert(organizerInvites)
      .values({ eventId, fullName, phoneE164: phone.e164, role, token: newInviteToken(), invitedByUserId: userId })
      .onConflictDoUpdate({
        target: [organizerInvites.eventId, organizerInvites.phoneE164],
        set: { role, fullName },
      })
      .returning();
    await acceptInvite(invite, account);

    revalidatePath(`/eventos/${eventId}/organizadores`);
    return { ok: `${(account.name || fullName).split(" ")[0]} ya tiene cuenta y ya puede entrar a este evento.` };
  }

  if (team.some((row) => phone.variants.includes(row.phoneE164) && row.userId)) {
    return { error: "Ese número ya está en la lista." };
  }

  if (formData.get("confirm") !== "1") {
    return { confirm: { name: fullName, phone: phone.e164 } };
  }

  const isNew = !pending.some((row) => row.phoneE164 === phone.e164);
  if (isNew && team.length + pending.length >= 10) {
    return { error: "Diez organizadores es el máximo por evento." };
  }

  const [invite] = await db
    .insert(organizerInvites)
    .values({ eventId, fullName, phoneE164: phone.e164, role, token: newInviteToken(), invitedByUserId: userId })
    .onConflictDoUpdate({
      target: [organizerInvites.eventId, organizerInvites.phoneE164],
      set: { role, fullName },
    })
    .returning();

  const sent = await deliverInvite(invite, inviterName, guard.event.name);

  revalidatePath(`/eventos/${eventId}/organizadores`);
  const link = inviteLink(invite.token);
  return {
    invited: {
      name: fullName,
      phone: phone.e164,
      link,
      message: inviteMessage({ invitee: fullName, inviter: inviterName, eventName: guard.event.name, link }),
      sent,
    },
  };
}

async function deliverInvite(
  invite: typeof organizerInvites.$inferSelect,
  inviterName: string,
  eventName: string,
): Promise<boolean> {
  const sent = await sendOrganizerInvite(invite.eventId, invite.phoneE164, {
    invitee: invite.fullName,
    inviter: inviterName,
    eventName,
    link: inviteLink(invite.token),
  });
  if (sent) {
    await db
      .update(organizerInvites)
      .set({ sentAt: new Date() })
      .where(eq(organizerInvites.id, invite.id));
  }
  return sent;
}

/** Sending a pending invitation again from our number. */
export async function resendInvite(eventId: string, inviteId: string): Promise<OrganizerState> {
  const guard = await editableEvent(eventId, "team");
  if (!guard.ok) return { error: guard.error };
  const { name } = await requireOrg();

  const invite = await db.query.organizerInvites.findFirst({
    where: and(eq(organizerInvites.eventId, eventId), eq(organizerInvites.id, inviteId)),
  });
  if (!invite) return { error: "Esa invitación ya no existe." };

  const sent = await deliverInvite(invite, name, guard.event.name);
  revalidatePath(`/eventos/${eventId}/organizadores`);
  return sent
    ? { ok: "Invitación enviada." }
    : { error: "No pudimos enviarla por WhatsApp. Compártele la liga desde tu WhatsApp." };
}

/** Withdrawing an invitation nobody has used yet. The link stops working. */
export async function revokeInvite(eventId: string, inviteId: string): Promise<OrganizerState> {
  const guard = await editableEvent(eventId, "team");
  if (!guard.ok) return { error: guard.error };

  await db
    .delete(organizerInvites)
    .where(and(eq(organizerInvites.eventId, eventId), eq(organizerInvites.id, inviteId)));

  revalidatePath(`/eventos/${eventId}/organizadores`);
  return {};
}

/** Changing the role an invitation will grant, before it is accepted. */
export async function setInviteRole(
  eventId: string,
  inviteId: string,
  role: InvitedRole,
): Promise<OrganizerState> {
  const guard = await editableEvent(eventId, "team");
  if (!guard.ok) return { error: guard.error };
  if (!invitedRoles.includes(role)) return { error: "Ese permiso no existe." };

  await db
    .update(organizerInvites)
    .set({ role })
    .where(and(eq(organizerInvites.eventId, eventId), eq(organizerInvites.id, inviteId)));

  revalidatePath(`/eventos/${eventId}/organizadores`);
  return {};
}

/**
 * Changing what an account on this event may do. Not the owner's, which has
 * no role to change, and not your own: demoting yourself by a slip would take
 * away the very page you would need to undo it.
 */
export async function setOrganizerRole(
  eventId: string,
  organizerId: string,
  role: InvitedRole,
): Promise<OrganizerState> {
  const guard = await editableEvent(eventId, "team");
  if (!guard.ok) return { error: guard.error };
  if (!invitedRoles.includes(role)) return { error: "Ese permiso no existe." };
  const { userId } = await requireOrg();

  const [updated] = await db
    .update(organizers)
    .set({ role, updatedAt: new Date() })
    .where(
      and(
        eq(organizers.eventId, eventId),
        eq(organizers.id, organizerId),
        eq(organizers.isOwner, false),
        isNotNull(organizers.userId),
        ne(organizers.userId, userId),
      ),
    )
    .returning({ id: organizers.id });
  if (!updated) return { error: "Ese permiso no se puede cambiar desde aquí." };

  revalidatePath(`/eventos/${eventId}/organizadores`);
  revalidatePath(`/eventos/${eventId}`, "layout");
  return {};
}
