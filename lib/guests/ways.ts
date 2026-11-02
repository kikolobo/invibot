import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { guests, users, type events } from "@/db/schema";
import { formatPhone } from "@/lib/phone";
import { whatsappConfig } from "@/lib/whatsapp/client";
import { registrationLink } from "./auto-register";

/**
 * What the "how to add guests" panels need to know, read the same way for
 * the wizard's last step and for Invitados: the registration link and its
 * waiting list, and the two numbers sharing contacts involves — ours, and
 * the organizer's own, which is the only one we accept contacts from.
 */
export type WaysToAdd = {
  registration: { enabled: boolean; link: string | null; pendingCount: number };
  contacts: { botPhone: string | null; botLink: string | null; ownPhone: string | null };
};

export async function waysToAdd(event: typeof events.$inferSelect, userId: string): Promise<WaysToAdd> {
  const [account, [{ pending }]] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId), columns: { phone: true } }),
    db
      .select({ pending: count() })
      .from(guests)
      .where(and(eq(guests.eventId, event.id), eq(guests.approvalStatus, "pending"))),
  ]);
  const bot = whatsappConfig()?.displayPhone ?? null;
  return {
    registration: { enabled: event.autoRegisterEnabled, link: registrationLink(event), pendingCount: pending },
    contacts: {
      botPhone: bot ? formatPhone(`+${bot}`) : null,
      botLink: bot ? `https://wa.me/${bot}` : null,
      ownPhone: account?.phone ? formatPhone(account.phone) : null,
    },
  };
}
