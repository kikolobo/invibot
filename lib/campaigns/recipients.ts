import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { events, guests, guestGroups, suppressions } from "@/db/schema";
import {
  formatEventWhen,
  formatEventWhere,
  formatEventWhereForMessage,
} from "@/lib/events/format";
import { renderTemplate, type TemplateName } from "@/lib/whatsapp/templates";
import { variantsOf } from "@/lib/phone";
import type { SkipReason, MissingField } from "./labels";

/**
 * Who gets an invitation, who does not, and why.
 *
 * Deliberately separate from the action that sends: the guest list page renders
 * this plan so an organizer can see the exact recipients before paying for
 * them, and the action rebuilds it server-side before sending. One set of rules,
 * consulted twice, so the preview cannot promise something the send does not do.
 */

type EventRow = typeof events.$inferSelect;

export type Invitee = {
  id: string;
  fullName: string;
  firstName: string | null;
  phoneE164: string | null;
  optedOut: boolean;
  approvalStatus: string;
  inviteStatus: string;
  groupName: string | null;
  partySizeAllowed: number;
};

/**
 * Which invitation this guest gets.
 *
 * The plus-one template is for exactly two seats. A party of four cannot be
 * expressed in three buttons, so those guests stay on the plain invitation and
 * settle the count in conversation — better than a button that undercounts them
 * and a guest who assumes the rest of the family is welcome.
 */
export function templateForGuest(guest: Pick<Invitee, "partySizeAllowed">): TemplateName {
  return guest.partySizeAllowed === 2 ? "invitacion_evento_acompanante" : "invitacion_evento";
}

export type InvitationPlan = {
  event: EventRow;
  /** Fields the template needs that the event has not filled in yet. */
  missing: MissingField[];
  eligible: Invitee[];
  skipped: { guest: Invitee; reason: SkipReason }[];
  /** The message as the first eligible guest will read it. */
  preview: ReturnType<typeof renderTemplate> | null;
};

/**
 * The invitation template has five slots and Meta rejects a send with an empty
 * one, so an event missing its hosts or its venue cannot be invited from at all.
 *
 * Refusing here rather than substituting a placeholder is the point. The
 * alternatives are a message that reads "undefined te invita" or one that
 * quietly omits where the party is, and both of those reach a guest's phone
 * permanently. `event.name` and `event.startsAt` are NOT NULL, so they cannot
 * go missing.
 */
export function missingForInvitation(event: EventRow): MissingField[] {
  const missing: MissingField[] = [];
  if (!event.hostNames?.trim()) missing.push("hostNames");
  if (!formatEventWhere(event).trim()) missing.push("venue");
  return missing;
}

/**
 * What the invitation calls this guest. `firstName` is set on import but a
 * hand-typed guest may only have a full name, and "Hola María Fernanda Ruiz de
 * la Garza" reads like a letter from a bank.
 */
export function greetingName(guest: Pick<Invitee, "fullName" | "firstName">): string {
  return guest.firstName?.trim() || guest.fullName.split(/\s+/)[0] || guest.fullName;
}

/**
 * The event's four variables, shared by every guest in a batch. Split from the
 * per-guest name so the preview can re-render for whoever is selected without
 * a round trip.
 */
export function eventVariables(event: EventRow): string[] {
  return [
    event.hostNames!.trim(),
    event.name,
    formatEventWhen(event),
    formatEventWhereForMessage(event),
  ];
}

/** The five template variables for one guest, in the order Meta matches them. */
export function invitationVariables(event: EventRow, guest: Invitee): string[] {
  return [greetingName(guest), ...eventVariables(event)];
}

/**
 * Sorts candidates into who can be invited and who cannot.
 *
 * A previously failed send stays eligible on purpose — a send that died on a
 * network blip is exactly the one worth retrying, and the ledger keeps the
 * failed attempt either way.
 */
export function partitionInvitees(
  candidates: Invitee[],
  suppressedPhones: Set<string>,
): { eligible: Invitee[]; skipped: { guest: Invitee; reason: SkipReason }[] } {
  const eligible: Invitee[] = [];
  const skipped: { guest: Invitee; reason: SkipReason }[] = [];

  for (const guest of candidates) {
    const reason = skipReasonFor(guest, suppressedPhones);
    if (reason) skipped.push({ guest, reason });
    else eligible.push(guest);
  }

  return { eligible, skipped };
}

function skipReasonFor(guest: Invitee, suppressedPhones: Set<string>): SkipReason | null {
  // Shown as skipped rather than filtered out of the query: a host who shared
  // the registration link is counting the people who signed up, and a plan that
  // silently omits them reads as if the registrations were lost.
  if (guest.approvalStatus === "pending") return "not_approved";
  if (guest.approvalStatus === "rejected") return "rejected";
  if (!guest.phoneE164) return "no_phone";
  if (guest.optedOut) return "opted_out";
  if (variantsOf(guest.phoneE164).some((variant) => suppressedPhones.has(variant))) {
    return "suppressed";
  }
  if (guest.inviteStatus === "queued") return "in_flight";
  if (guest.inviteStatus !== "pending" && guest.inviteStatus !== "failed") {
    return "already_invited";
  }
  return null;
}

/**
 * Builds the plan for an event, optionally narrowed to a chosen set of guests.
 *
 * The caller passes guest ids, never guest rows: an id says *which* guest and
 * the database says everything else, so a tampered form cannot invent a phone
 * number or clear someone's opt-out.
 */
export async function invitationPlan(
  eventId: string,
  orgId: string,
  guestIds?: string[],
): Promise<InvitationPlan | null> {
  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.orgId, orgId)),
  });
  if (!event) return null;

  const rows = await db
    .select({
      id: guests.id,
      fullName: guests.fullName,
      firstName: guests.firstName,
      phoneE164: guests.phoneE164,
      optedOut: guests.optedOut,
      approvalStatus: guests.approvalStatus,
      inviteStatus: guests.inviteStatus,
      groupName: guestGroups.name,
      partySizeAllowed: guests.partySizeAllowed,
    })
    .from(guests)
    .leftJoin(guestGroups, eq(guests.groupId, guestGroups.id))
    .where(
      guestIds?.length
        ? and(eq(guests.eventId, eventId), inArray(guests.id, guestIds))
        : eq(guests.eventId, eventId),
    );

  // One query for the whole batch rather than one per guest. `deliver()` checks
  // this again before every individual send — this pass exists so the organizer
  // sees an honest count, not so the send can trust it.
  const phones = rows.flatMap((row) => (row.phoneE164 ? variantsOf(row.phoneE164) : []));
  const suppressedPhones = new Set<string>();
  if (phones.length > 0) {
    const blocked = await db
      .select({ phoneE164: suppressions.phoneE164 })
      .from(suppressions)
      .where(inArray(suppressions.phoneE164, phones));
    for (const row of blocked) if (row.phoneE164) suppressedPhones.add(row.phoneE164);
  }

  const candidates = [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
  const { eligible, skipped } = partitionInvitees(candidates, suppressedPhones);
  const missing = missingForInvitation(event);

  return {
    event,
    missing,
    eligible,
    skipped,
    preview:
      missing.length === 0 && eligible[0]
        ? renderTemplate(
            templateForGuest(eligible[0]),
            invitationVariables(event, eligible[0]),
          )
        : null,
  };
}
