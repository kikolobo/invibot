import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { guestPasses, events, guests } from "@/db/schema";

type GuestRow = typeof guests.$inferSelect;

/**
 * Issuing and revoking the QR a guest shows at the door.
 *
 * The rule that makes a pass worth anything: it is never reactivated. Someone
 * who cancels has theirs revoked, and confirming again mints a new code — so a
 * screenshot taken before they cancelled opens nothing. Reactivating the old
 * one would make every pass permanently valid from the first time it was sent.
 */

/** Opaque and unguessable. Never the guest's id: that leaks and it never changes. */
const newCode = () => nanoid(22);

/**
 * What is printed under the companion's QR.
 *
 * Their own name where the host has it. "Acompañante de Ana" tells whoever is
 * holding the list at the door nothing they can check against an ID or a face.
 */
const companionLabel = (guestName: string, companion: string | undefined) =>
  companion?.trim() ? companion.trim() : `Acompañante de ${guestName}`;

/**
 * Brings a guest's passes in line with what they confirmed.
 *
 * Returns the passes that should be sent — empty when the event does not use
 * them, when the guest is not coming, or when nothing changed and the existing
 * passes have already gone out.
 */
export async function syncPasses(guest: GuestRow): Promise<(typeof guestPasses.$inferSelect)[]> {
  const event = await db.query.events.findFirst({ where: eq(events.id, guest.eventId) });
  if (!event?.qrEnabled) return [];

  const active = await db
    .select()
    .from(guestPasses)
    .where(and(eq(guestPasses.guestId, guest.id), eq(guestPasses.status, "active")));

  // Not coming: nothing to carry, and anything outstanding stops working.
  if (guest.rsvpStatus !== "confirmed" || guest.optedOut) {
    if (active.length > 0) await revokePasses(guest.id);
    return [];
  }

  const seats = Math.min(guest.partySizeConfirmed ?? 1, guest.partySizeAllowed);
  const name = guest.firstName?.trim() || guest.fullName.split(/\s+/)[0] || guest.fullName;

  // The right number already exists and has been delivered: leave them alone.
  // Re-minting on every message would invalidate the code in the guest's hand.
  if (active.length === seats) {
    return active.filter((pass) => pass.sentAt === null);
  }

  // The count changed — a companion added or dropped — so the whole set is
  // replaced. Keeping one and adding another would leave two codes issued at
  // different times for one party, which is harder to reason about at a door
  // than two minted together.
  await revokePasses(guest.id);

  return db
    .insert(guestPasses)
    .values(
      Array.from({ length: seats }, (_, index) => ({
        eventId: guest.eventId,
        guestId: guest.id,
        code: newCode(),
        seat: index + 1,
        label: index === 0 ? guest.fullName : companionLabel(name, guest.companions[index - 1]),
      })),
    )
    .returning();
}

export async function revokePasses(guestId: string): Promise<void> {
  await db
    .update(guestPasses)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(guestPasses.guestId, guestId), eq(guestPasses.status, "active")));
}

export async function markPassSent(passId: string): Promise<void> {
  await db.update(guestPasses).set({ sentAt: new Date() }).where(eq(guestPasses.id, passId));
}

/** Every pass the guest currently holds, sent or not, in seat order. */
export async function activePasses(guestId: string): Promise<(typeof guestPasses.$inferSelect)[]> {
  return db
    .select()
    .from(guestPasses)
    .where(and(eq(guestPasses.guestId, guestId), eq(guestPasses.status, "active")))
    .orderBy(asc(guestPasses.seat));
}
