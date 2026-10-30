import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, promoCodes, promoRedemptions, users } from "@/db/schema";

export type PromoState = "active" | "used_up" | "expired" | "inactive";

export const promoStateLabels: Record<PromoState, string> = {
  active: "Activo",
  used_up: "Agotado",
  expired: "Vencido",
  inactive: "Suspendido",
};

export const promoStateOf = (promo: typeof promoCodes.$inferSelect): PromoState =>
  !promo.active
    ? "inactive"
    : promo.expiresAt && promo.expiresAt.getTime() <= Date.now()
      ? "expired"
      : promo.redeemedCount >= promo.maxRedemptions
        ? "used_up"
        : "active";

/** Every code, newest first, with who used each one and on what. */
export async function listPromoCodes() {
  const [codes, uses] = await Promise.all([
    db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt)),
    db
      .select({
        id: promoRedemptions.id,
        codeId: promoRedemptions.codeId,
        slots: promoRedemptions.slots,
        createdAt: promoRedemptions.createdAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        eventId: events.id,
        eventName: events.name,
      })
      .from(promoRedemptions)
      .innerJoin(users, eq(users.id, promoRedemptions.userId))
      .leftJoin(events, eq(events.id, promoRedemptions.eventId))
      .orderBy(desc(promoRedemptions.createdAt)),
  ]);
  return codes.map((code) => ({ ...code, uses: uses.filter((use) => use.codeId === code.id) }));
}
