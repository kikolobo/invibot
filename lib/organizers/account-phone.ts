import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { events, organizations, organizers, users } from "@/db/schema";
import { variantsOf } from "@/lib/phone";

export const PHONE_TAKEN = "Ese WhatsApp ya está en otra cuenta de Invibot.";

/** Whether another account already holds this number, in any of its shapes. */
export async function phoneTaken(e164: string, exceptUserId?: string): Promise<boolean> {
  const other = await db.query.users.findFirst({
    where: and(
      inArray(users.phone, variantsOf(e164)),
      exceptUserId ? ne(users.id, exceptUserId) : undefined,
    ),
    columns: { id: true },
  });
  return Boolean(other);
}

/**
 * Changing the WhatsApp an account uses, everywhere it is used.
 *
 * An organizer row carries its own copy of the number — the WhatsApp side
 * matches on it, and it is where guests' questions are sent — so changing only
 * the account would leave every event still writing to the old phone. The rows
 * that are this account's are the ones it was invited into and the owner rows
 * on its own events.
 *
 * One number per account, and one account per number: a lookup by number is
 * how invitations find people, and two answers to it would be a coin flip.
 */
export async function changeAccountPhone(
  userId: string,
  e164: string,
): Promise<{ error?: string; skipped?: number }> {
  if (await phoneTaken(e164, userId)) return { error: PHONE_TAKEN };

  await db.update(users).set({ phone: e164 }).where(eq(users.id, userId));

  const ownEvents = db
    .select({ id: events.id })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.orgId))
    .where(eq(organizations.ownerUserId, userId));

  const rows = await db
    .select({ id: organizers.id })
    .from(organizers)
    .where(
      or(
        eq(organizers.userId, userId),
        and(eq(organizers.isOwner, true), inArray(organizers.eventId, ownEvents)),
      ),
    );

  // Row by row, because one event may already list the new number as somebody
  // else — the (event, phone) index refuses that update, and it should not
  // take the other events down with it.
  let skipped = 0;
  for (const row of rows) {
    try {
      await db
        .update(organizers)
        .set({ phoneE164: e164, phoneVariants: variantsOf(e164), updatedAt: new Date() })
        .where(eq(organizers.id, row.id));
    } catch {
      skipped += 1;
    }
  }

  return { skipped };
}
