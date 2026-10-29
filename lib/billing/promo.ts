import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, promoCodes, promoRedemptions } from "@/db/schema";

/** Typed in any case, with or without spaces; stored and compared upper-case. */
export const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, "");

/** Readable when spoken aloud: no 0/O or 1/I to argue about. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateCode(length = 8) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

export type RedeemResult = { ok: true; slots: number } | { ok: false; error: string };

const INVALID = "Este código ya no es válido.";

/**
 * Uses a courtesy code for this account, on this event.
 *
 * All of it under a lock on the code's row: the count is read, checked and
 * moved in one transaction, so the last place goes to exactly one person. The
 * unique (code, user) index is the second wall — an account that already
 * used the code is told so rather than given it twice.
 *
 * The message for a code that never existed is the same as for one that ran
 * out, so nobody can probe for valid codes by the difference.
 */
export async function redeemCode(raw: string, userId: string, eventId: string): Promise<RedeemResult> {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, error: "Escribe el código." };

  return db.transaction(async (tx) => {
    const [promo] = await tx
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.code, code))
      .for("update");
    if (!promo || !promo.active) return { ok: false, error: INVALID } as const;
    if (promo.expiresAt && promo.expiresAt.getTime() <= Date.now()) return { ok: false, error: INVALID } as const;
    if (promo.redeemedCount >= promo.maxRedemptions) return { ok: false, error: INVALID } as const;

    const used = await tx
      .select({ id: promoRedemptions.id })
      .from(promoRedemptions)
      .where(and(eq(promoRedemptions.codeId, promo.id), eq(promoRedemptions.userId, userId)));
    if (used.length) return { ok: false, error: "Ya usaste este código en tu cuenta." } as const;

    await tx.insert(promoRedemptions).values({ codeId: promo.id, userId, eventId, slots: promo.slotsPerUser });
    await tx
      .update(promoCodes)
      .set({ redeemedCount: sql`${promoCodes.redeemedCount} + 1` })
      .where(eq(promoCodes.id, promo.id));
    await tx
      .update(events)
      .set({ giftedSlots: sql`${events.giftedSlots} + ${promo.slotsPerUser}`, updatedAt: new Date() })
      .where(eq(events.id, eventId));

    return { ok: true, slots: promo.slotsPerUser } as const;
  });
}
