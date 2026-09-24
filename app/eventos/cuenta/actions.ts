"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/session";
import { changeAccountPhone } from "@/lib/organizers/account-phone";
import { normalizePhone } from "@/lib/phone";

export type PhoneState = { error?: string; ok?: string };

/** Your own WhatsApp, and every event that writes to it. */
export async function updateMyPhone(_prev: PhoneState, formData: FormData): Promise<PhoneState> {
  const { userId } = await requireOrg();

  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Ese número de WhatsApp no parece válido." };

  const result = await changeAccountPhone(userId, phone.e164);
  if (result.error) return { error: result.error };

  revalidatePath("/eventos/cuenta");
  return {
    ok: result.skipped
      ? `Guardado. En ${result.skipped === 1 ? "un evento" : `${result.skipped} eventos`} ese número ya estaba en la lista con otra persona, y ahí se quedó el anterior.`
      : "Guardado. Tus eventos ya usan este número.",
  };
}
