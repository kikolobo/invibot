import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "@/db";
import { events, organizations, organizers, users } from "@/db/schema";
import { variantsOf } from "@/lib/phone";

/** Six characters, no confusable glyphs — read aloud and retyped like any code. */
const newStaffCode = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 6);

/**
 * Minted lazily so events created before organizers existed get one the moment
 * they need it, rather than needing a backfill.
 */
export async function ensureStaffCode(eventId: string): Promise<void> {
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { staffCode: true },
  });
  if (!event || event.staffCode) return;

  await db
    .update(events)
    .set({ staffCode: newStaffCode(), updatedAt: new Date() })
    .where(eq(events.id, eventId));
}

/**
 * Putting the account owner on an event's organizer list.
 *
 * Called when an event is created and again whenever its organizers are shown,
 * which is what brings events from before this rule along. Returns false only
 * when there is nothing to put there: an account from before signup asked for
 * a WhatsApp number.
 *
 * On a fresh event the owner is the first organizer and so takes the guests'
 * questions. On an older one somebody may already be taking them, and moving
 * that behind the host's back would send the next question to a different
 * phone — so the owner only becomes responder when nobody is.
 */
export async function ensureOwner(eventId: string): Promise<boolean> {
  const current = await db.query.organizers.findFirst({
    where: and(eq(organizers.eventId, eventId), eq(organizers.isOwner, true)),
    columns: { id: true },
  });
  if (current) return true;

  // Resolved from the event rather than taken from whoever is looking: an
  // invited admin opening the page must not be written in as its owner.
  const [user] = await db
    .select({ name: users.name, email: users.email, phone: users.phone })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.orgId))
    .innerJoin(users, eq(users.id, organizations.ownerUserId))
    .where(eq(events.id, eventId))
    .limit(1);
  if (!user?.phone) return false;

  const team = await db
    .select({
      id: organizers.id,
      phoneE164: organizers.phoneE164,
      isResponder: organizers.isResponder,
    })
    .from(organizers)
    .where(eq(organizers.eventId, eventId));

  // They added themselves by hand before this existed. That row, with the
  // name they chose, is them — a second one would be refused by the
  // (event, phone) index anyway.
  const self = team.find((row) => row.phoneE164 === user.phone);
  if (self) {
    await db
      .update(organizers)
      .set({ isOwner: true, updatedAt: new Date() })
      .where(eq(organizers.id, self.id));
    return true;
  }

  await db
    .insert(organizers)
    .values({
      eventId,
      fullName: user.name || user.email,
      phoneE164: user.phone,
      phoneVariants: variantsOf(user.phone),
      isOwner: true,
      isResponder: !team.some((row) => row.isResponder),
    })
    // Two tabs opening the page at once on a brand new event.
    .onConflictDoNothing();

  await ensureStaffCode(eventId);
  return true;
}
