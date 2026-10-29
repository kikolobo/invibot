import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, events, guests, organizations, users } from "@/db/schema";
import { getSettings, type SiteSettings } from "@/lib/site/settings";

/**
 * Guest places: the one thing Invibot charges for.
 *
 * Everything an organizer does in the app is free. What costs us is talking to
 * their guests — the invitation, every reminder, the pass, each answer from
 * the assistant — so that is what a place pays for, once per guest and for the
 * life of the event. A guest takes a place the first time anything is sent to
 * them, and keeps it.
 *
 * The check lives in `deliver()`, the one door every message to a guest goes
 * through, so no new kind of message can forget to pay.
 */

export type SlotStatus = {
  /** "Cortesía": the owner never pays. */
  exempt: boolean;
  paid: number;
  gifted: number;
  used: number;
  available: number;
  /** Approved guests who have not been sent anything yet. */
  waiting: number;
};

export async function slotStatus(eventId: string): Promise<SlotStatus | null> {
  const [row] = await db
    .select({
      paid: events.paidSlots,
      gifted: events.giftedSlots,
      exempt: users.billingExempt,
    })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.orgId))
    .innerJoin(users, eq(users.id, organizations.ownerUserId))
    .where(eq(events.id, eventId));
  if (!row) return null;

  const [[{ used }], [{ waiting }]] = await Promise.all([
    db
      .select({ used: count() })
      .from(guests)
      .where(and(eq(guests.eventId, eventId), isNotNull(guests.billedAt))),
    db
      .select({ waiting: count() })
      .from(guests)
      .where(
        and(
          eq(guests.eventId, eventId),
          isNull(guests.billedAt),
          eq(guests.approvalStatus, "approved"),
          eq(guests.optedOut, false),
          isNotNull(guests.phoneE164),
        ),
      ),
  ]);

  const total = row.paid + row.gifted;
  return {
    exempt: row.exempt,
    paid: row.paid,
    gifted: row.gifted,
    used,
    available: Math.max(0, total - used),
    waiting,
  };
}

/** How many more places sending to `guestIds` would need. Zero when it is covered. */
export async function shortfallFor(eventId: string, guestIds: string[]): Promise<number> {
  const status = await slotStatus(eventId);
  if (!status || status.exempt || guestIds.length === 0) return 0;
  const rows = await db
    .select({ id: guests.id, billedAt: guests.billedAt })
    .from(guests)
    .where(eq(guests.eventId, eventId));
  const wanted = new Set(guestIds);
  const fresh = rows.filter((row) => wanted.has(row.id) && !row.billedAt).length;
  return Math.max(0, fresh - status.available);
}

/**
 * Gives this guest a place, if they have none and one is free. Under a lock on
 * the event row, so two sends running at once cannot both take the last one.
 *
 * Returns whether the guest may be sent to, and whether this call is what
 * took the place — so a send that then fails can give it back.
 */
export async function claimSlot(
  guestId: string,
  eventId: string,
): Promise<{ ok: boolean; claimed: boolean }> {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .select({ paid: events.paidSlots, gifted: events.giftedSlots, orgId: events.orgId })
      .from(events)
      .where(eq(events.id, eventId))
      .for("update");
    if (!event) return { ok: false, claimed: false };

    const [guest] = await tx
      .select({ billedAt: guests.billedAt })
      .from(guests)
      .where(eq(guests.id, guestId));
    if (!guest) return { ok: false, claimed: false };
    if (guest.billedAt) return { ok: true, claimed: false };

    const [owner] = await tx
      .select({ exempt: users.billingExempt })
      .from(organizations)
      .innerJoin(users, eq(users.id, organizations.ownerUserId))
      .where(eq(organizations.id, event.orgId));

    if (!owner?.exempt) {
      const [{ used }] = await tx
        .select({ used: count() })
        .from(guests)
        .where(and(eq(guests.eventId, eventId), isNotNull(guests.billedAt)));
      if (used >= event.paid + event.gifted) return { ok: false, claimed: false };
    }

    // Exempt owners take a place too: it costs them nothing, and it keeps the
    // count of who has been reached honest if the cortesía is ever lifted.
    await tx
      .update(guests)
      .set({ billedAt: new Date() })
      .where(and(eq(guests.id, guestId), isNull(guests.billedAt)));
    return { ok: true, claimed: true };
  });
}

/** Undoes a claim whose send never reached the guest. */
export async function releaseSlot(guestId: string) {
  await db.update(guests).set({ billedAt: null }).where(eq(guests.id, guestId));
}

/**
 * What buying places for `needed` guests comes to. A small need is rounded up
 * to the minimum purchase; the extra places stay on the event.
 */
export function quote(needed: number, settings: SiteSettings) {
  const slots = Math.max(needed, settings.minimumSlots, 1);
  return {
    slots,
    unitAmountMinor: settings.pricePerGuestMinor,
    amountMinor: slots * settings.pricePerGuestMinor,
    currency: settings.currency,
  };
}

export async function quoteFor(needed: number) {
  return quote(needed, await getSettings());
}

/** Whether rehearsing in the simulator is still free for this event. */
export async function simulatorAllowance(eventId: string) {
  const [settings, status, [{ used }]] = await Promise.all([
    getSettings(),
    slotStatus(eventId),
    db
      .select({ used: count() })
      .from(aiUsage)
      .where(and(eq(aiUsage.eventId, eventId), eq(aiUsage.source, "simulator"))),
  ]);
  // Anyone who has paid for places, or never pays, rehearses as much as they like.
  const unlimited = Boolean(status && (status.exempt || status.paid > 0));
  return {
    unlimited,
    used,
    free: settings.freeSimulatorTurns,
    left: Math.max(0, settings.freeSimulatorTurns - used),
  };
}
