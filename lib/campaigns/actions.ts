"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { campaigns, guests, events } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { setGuestApproval } from "@/lib/guests/actions";
import { editableEvent } from "@/lib/events/guard";
import { buildComponents } from "@/lib/whatsapp/templates";
import { sendTemplateToGuest } from "@/lib/whatsapp/send";
import { recordGuestEvent } from "@/lib/guests/history";
import { invitationPlan, invitationVariables, templateForGuest } from "./recipients";
import { missingLabels } from "./labels";

/**
 * Sending the invitations — the one action that opens a conversation.
 *
 * Everything below the surface already exists: `sendTemplateToGuest` checks
 * suppression and writes the ledger, and the webhook records what comes back.
 * This is the trigger, and what it mostly does is refuse to send: to a guest
 * the organizer did not pick, to one who opted out, to one already invited, or
 * from an event whose template slots are not filled in.
 */

/**
 * Past this, a batch stops fitting in a request and belongs to a durable
 * workflow with its own retries and pacing against the tier limit. Refusing is
 * better than a send that times out halfway with no record of where it stopped.
 */
const MAX_PER_BATCH = 50;

export type InviteOutcome = {
  guestId: string;
  name: string;
  ok: boolean;
  /** Why it failed, already in Spanish and safe to show an organizer. */
  detail?: string;
};

export type InviteReport = {
  error?: string;
  sent?: number;
  failed?: number;
  outcomes?: InviteOutcome[];
};

const failureText: Record<string, string> = {
  not_found: "Ya no está en la lista.",
  no_phone: "No tiene teléfono.",
  opted_out: "Pidió no recibir mensajes.",
  suppressed: "Está en la lista de bajas.",
  window_closed: "No se pudo abrir la conversación.",
  not_approved: "Falta aprobarlo.",
  not_configured: "WhatsApp no está configurado en este entorno.",
  provider_error: "WhatsApp rechazó el envío.",
};

export async function sendInvitations(
  eventId: string,
  guestIds: string[],
): Promise<InviteReport> {
  const { orgId, userId } = await requireOrg();

  if (guestIds.length === 0) return { error: "No seleccionaste a nadie." };

  const guard = await editableEvent(eventId, orgId);
  if (!guard.ok) return { error: guard.error };

  // Rebuilt from the database, never taken from the form: the ids say which
  // guests, and every other fact — phone, opt-out, invite status — is read
  // fresh here so a stale page cannot re-invite someone who just opted out.
  const plan = await invitationPlan(eventId, orgId, guestIds);
  if (!plan) return { error: "No encontramos ese evento." };

  if (plan.missing.length > 0) {
    const fields = plan.missing.map((field) => missingLabels[field]).join(" y ");
    return { error: `Antes de invitar hay que llenar ${fields} en los detalles del evento.` };
  }

  const recipients = plan.eligible;
  if (recipients.length === 0) {
    return { error: "Nadie de los seleccionados puede recibir la invitación ahora." };
  }
  if (recipients.length > MAX_PER_BATCH) {
    return {
      error: `Por ahora enviamos hasta ${MAX_PER_BATCH} invitaciones a la vez. Selecciona menos invitados.`,
    };
  }

  const ids = recipients.map((guest) => guest.id);

  const [campaign] = await db
    .insert(campaigns)
    .values({
      eventId,
      kind: "invite",
      status: "running",
      totalCount: recipients.length,
      approvedByUserId: userId,
      approvedAt: new Date(),
    })
    .returning();

  // Claim the whole batch before the first send. A second tab that submits
  // while this is running rebuilds its plan, sees `queued`, and skips them
  // rather than inviting everyone twice.
  await db
    .update(guests)
    .set({ inviteStatus: "queued", updatedAt: new Date() })
    .where(and(eq(guests.eventId, eventId), inArray(guests.id, ids)));

  const outcomes: InviteOutcome[] = [];

  try {
    // Sequential on purpose. These are paid messages against a tiered daily
    // limit, and a burst of parallel sends is what gets a number rate-limited
    // or its quality rating knocked down.
    for (const guest of recipients) {
      const template = templateForGuest(guest);
      const outcome = await sendTemplateToGuest(
        guest.id,
        {
          name: template,
          language: "es_MX",
          components: buildComponents(template, invitationVariables(plan.event, guest)),
        },
        "invite",
      );

      await db
        .update(guests)
        .set({ inviteStatus: outcome.ok ? "sent" : "failed", updatedAt: new Date() })
        .where(eq(guests.id, guest.id));

      if (outcome.ok) {
        await recordGuestEvent({
          eventId,
          guestId: guest.id,
          type: "invited",
          at: new Date(),
          source: "organizer",
          detail: { template },
        });
      }

      outcomes.push({
        guestId: guest.id,
        name: guest.fullName,
        ok: outcome.ok,
        detail: outcome.ok
          ? undefined
          : `${failureText[outcome.reason] ?? "No se pudo enviar."} ${outcome.detail}`.trim(),
      });
    }
  } finally {
    // Whatever happened above, nobody is left claimed. A guest stuck on
    // `queued` would be skipped by every future batch as "enviándose ahora"
    // and silently never invited at all.
    await db
      .update(guests)
      .set({ inviteStatus: "failed", updatedAt: new Date() })
      .where(
        and(
          eq(guests.eventId, eventId),
          inArray(guests.id, ids),
          eq(guests.inviteStatus, "queued"),
        ),
      );

    const sent = outcomes.filter((outcome) => outcome.ok).length;

    // The event's own status had never moved off "draft" — not when
    // invitations went out, not when guests confirmed. An event with
    // invitations on people's phones is not a draft, and the overview was
    // saying it was.
    if (sent > 0 && (plan.event.status === "draft" || plan.event.status === "ready")) {
      await db
        .update(events)
        .set({ status: "live", publishedAt: plan.event.publishedAt ?? new Date() })
        .where(eq(events.id, eventId));
    }

    await db
      .update(campaigns)
      .set({
        status: sent === recipients.length ? "done" : "failed",
        sentCount: sent,
        failedCount: recipients.length - sent,
      })
      .where(eq(campaigns.id, campaign.id));

    revalidatePath(`/eventos/${eventId}/invitados`);
  }

  const sent = outcomes.filter((outcome) => outcome.ok).length;
  return { sent, failed: outcomes.length - sent, outcomes };
}

/**
 * Letting someone in and inviting them, in one press.
 *
 * Approving and then inviting are two separate things an organizer almost
 * always wants together: somebody registered themselves, you looked at the
 * name, and the next thing you want is for them to have their invitation.
 * Making that two trips through two screens is how a guest ends up approved
 * and never invited.
 *
 * Approval lands first and is not undone if the send fails. Being on the list
 * is the decision; the invitation is a message, and a message that failed can
 * be retried from the guest list — where a failed send already leaves the
 * guest eligible on purpose.
 */
export async function approveAndInvite(
  eventId: string,
  guestIds: string[],
): Promise<InviteReport> {
  if (guestIds.length === 0) return { sent: 0, failed: 0, outcomes: [] };

  await setGuestApproval(eventId, guestIds, true);
  return sendInvitations(eventId, guestIds);
}
