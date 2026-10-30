"use server";

import { getSession } from "@/lib/auth/session";
import { checkCode, redeemCode } from "@/lib/billing/promo";

export type PromoCheck = { ok: true; slots: number } | { ok: false; error: string };

/** Checks a courtesy code as it is typed at signup, without using it. */
export async function checkSignupPromo(code: string): Promise<PromoCheck> {
  try {
    return await checkCode(code);
  } catch (error) {
    console.error("[promo] check failed", error);
    return { ok: false, error: "No pudimos revisar el código. Inténtalo otra vez." };
  }
}

/**
 * Right after the account exists: sets the code aside for it, counted as
 * used so nobody else takes the last place. Its places land on the first
 * event the account makes.
 */
export async function claimSignupPromo(code: string): Promise<PromoCheck> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: "Inicia sesión para usar el código." };
  try {
    return await redeemCode(code, session.user.id, null);
  } catch (error) {
    console.error("[promo] claim at signup failed", error);
    return { ok: false, error: "No pudimos apartar el código; úsalo en Pagos de tu evento." };
  }
}
