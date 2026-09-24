"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { guests } from "@/db/schema/guests";
import { editableEvent } from "./guard";
import { formatEventWhen, formatEventWhereForMessage } from "./format";
import { greetingName } from "@/lib/campaigns/recipients";
import { buildComponents } from "@/lib/whatsapp/templates";
import { sendTemplateToGuest } from "@/lib/whatsapp/send";

/**
 * Telling guests the event moved.
 *
 * Who gets what depends on where they are, and the difference matters:
 *
 * A guest who never answered gets the invitation again, with its buttons, and
 * a header saying it is an update. Their 24-hour window closed long ago — only
 * their own message opens one — so a template is the only thing that can reach
 * them at all, and they still owe an answer.
 *
 * A guest who already confirmed gets the news and no buttons. They have
 * answered; putting "No podré" back in front of them invites a cancellation
 * that was never on the table. If the change breaks their plans they will say
 * so, and the assistant is listening.
 *
 * A guest who declined gets nothing. They are not coming, and a new date does
 * not oblige them to reconsider by message.
 */

export type NotifyResult = {
  error?: string;
  /** Sent, by kind, for the organizer to read back. */
  updated?: number;
  informed?: number;
  failed?: number;
};

export async function notifyGuestsOfChange(
  eventId: string,
  summary: string,
): Promise<NotifyResult> {

  const guard = await editableEvent(eventId, "event");
  if (!guard.ok) return { error: guard.error };
  const event = guard.event;

  if (!summary.trim()) return { error: "No hay nada que avisar." };

  // Only people who were actually invited. Someone still pending will receive
  // the current details whenever their first invitation goes out.
  const recipients = await db
    .select()
    .from(guests)
    .where(
      and(
        eq(guests.eventId, eventId),
        inArray(guests.inviteStatus, ["sent", "delivered", "read"]),
      ),
    );

  const when = formatEventWhen(event);
  const where = formatEventWhereForMessage(event);

  let updated = 0;
  let informed = 0;
  let failed = 0;

  for (const guest of recipients) {
    if (guest.optedOut) continue;
    if (guest.rsvpStatus === "declined") continue;

    const name = greetingName(guest);
    const confirmed = guest.rsvpStatus === "confirmed";

    const template = confirmed
      ? "aviso_cambio_evento"
      : guest.partySizeAllowed >= 2
        ? "invitacion_actualizada_acompanante"
        : "invitacion_actualizada";

    const outcome = await sendTemplateToGuest(
      guest.id,
      {
        name: template,
        language: "es_MX",
        components: buildComponents(template, [name, event.name, summary, when, where]),
      },
      confirmed ? "logistics" : "invite",
    );

    if (!outcome.ok) {
      failed++;
      console.error("[notify] failed", guest.id, outcome.reason, outcome.detail);
      continue;
    }

    if (confirmed) informed++;
    else updated++;
  }

  return { updated, informed, failed };
}

/** How many guests each kind of message would reach, before sending any. */
export async function previewNotifyAudience(eventId: string): Promise<{
  updated: number;
  informed: number;
}> {
  const guard = await editableEvent(eventId, "event");
  if (!guard.ok) return { updated: 0, informed: 0 };

  const recipients = await db
    .select({ rsvpStatus: guests.rsvpStatus, optedOut: guests.optedOut })
    .from(guests)
    .where(
      and(
        eq(guests.eventId, eventId),
        inArray(guests.inviteStatus, ["sent", "delivered", "read"]),
      ),
    );

  let updated = 0;
  let informed = 0;
  for (const guest of recipients) {
    if (guest.optedOut || guest.rsvpStatus === "declined") continue;
    if (guest.rsvpStatus === "confirmed") informed++;
    else updated++;
  }

  return { updated, informed };
}
