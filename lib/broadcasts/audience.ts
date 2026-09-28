import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { conversations, guests, suppressions } from "@/db/schema";
import { variantsOf } from "@/lib/phone";
import type { Audience, ExclusionReason } from "./labels";

/**
 * Who a message reaches, decided once for the preview and again at the moment
 * it goes out — the same rules both times, so the confirmation cannot promise
 * something the send does not do.
 *
 * Only guests who already have their invitation are reached. Anyone else is
 * counted and named as left out, never silently dropped: "7 invitados no han
 * recibido su invitación" is something the organizer needs to know before
 * sending, not something to discover later.
 */

export type Recipient = {
  id: string;
  fullName: string;
  firstName: string | null;
  groupId: string | null;
  /** Their own window is open, so the whole message goes out free. */
  windowOpen: boolean;
};

export type Resolution = {
  recipients: Recipient[];
  excluded: Partial<Record<ExclusionReason, number>>;
};

/** The window has to outlast the send, or a free message fails mid-batch. */
const WINDOW_MARGIN_MS = 15 * 60 * 1000;

const INVITED = new Set(["sent", "delivered", "read"]);

export async function resolveAudience(
  eventId: string,
  audience: Audience,
  now = new Date(),
): Promise<Resolution> {
  const conditions = [eq(guests.eventId, eventId), ne(guests.approvalStatus, "rejected")];

  switch (audience.kind) {
    case "not_declined":
      conditions.push(ne(guests.rsvpStatus, "declined"));
      break;
    case "confirmed":
      conditions.push(eq(guests.rsvpStatus, "confirmed"));
      break;
    case "declined":
      conditions.push(eq(guests.rsvpStatus, "declined"));
      break;
    case "no_response":
      conditions.push(eq(guests.rsvpStatus, "no_response"));
      break;
    case "groups":
      if (audience.ids.length === 0) return { recipients: [], excluded: {} };
      conditions.push(inArray(guests.groupId, audience.ids));
      break;
    case "guests":
      if (audience.ids.length === 0) return { recipients: [], excluded: {} };
      conditions.push(inArray(guests.id, audience.ids));
      break;
  }

  const rows = await db
    .select({
      id: guests.id,
      fullName: guests.fullName,
      firstName: guests.firstName,
      groupId: guests.groupId,
      phoneE164: guests.phoneE164,
      approvalStatus: guests.approvalStatus,
      inviteStatus: guests.inviteStatus,
      optedOut: guests.optedOut,
      windowExpiresAt: conversations.windowExpiresAt,
    })
    .from(guests)
    .leftJoin(
      conversations,
      and(eq(conversations.guestId, guests.id), eq(conversations.channel, "whatsapp")),
    )
    .where(and(...conditions));

  // One query for the whole audience. `deliver()` checks again before every
  // individual send; this pass is so the preview can say who is left out.
  const phones = rows.flatMap((row) => (row.phoneE164 ? variantsOf(row.phoneE164) : []));
  const suppressed = new Set<string>();
  if (phones.length > 0) {
    const blocked = await db
      .select({ phoneE164: suppressions.phoneE164 })
      .from(suppressions)
      .where(inArray(suppressions.phoneE164, phones));
    for (const row of blocked) if (row.phoneE164) suppressed.add(row.phoneE164);
  }

  const recipients: Recipient[] = [];
  const excluded: Partial<Record<ExclusionReason, number>> = {};
  const skip = (reason: ExclusionReason) => (excluded[reason] = (excluded[reason] ?? 0) + 1);

  for (const row of rows) {
    if (row.approvalStatus !== "approved") skip("not_approved");
    else if (!row.phoneE164) skip("no_phone");
    else if (row.optedOut || variantsOf(row.phoneE164).some((v) => suppressed.has(v))) {
      skip("opted_out");
    } else if (!INVITED.has(row.inviteStatus)) skip("not_invited");
    else {
      recipients.push({
        id: row.id,
        fullName: row.fullName,
        firstName: row.firstName,
        groupId: row.groupId,
        windowOpen: (row.windowExpiresAt?.getTime() ?? 0) > now.getTime() + WINDOW_MARGIN_MS,
      });
    }
  }

  recipients.sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
  return { recipients, excluded };
}
