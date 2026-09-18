"use server";

import { cookies } from "next/headers";
import { GATE_COOKIE, GATE_MAX_AGE, passcodeAccepted } from "@/lib/auth/signup-gate";

export type UnlockState = { error?: string };

/**
 * Checking the shared code and, if it is right, opening the door for an hour.
 *
 * The cookie is httpOnly so the page's own JavaScript cannot read or mint it —
 * the only thing that writes it is this action, and the only thing that trusts
 * it is the hook that creates the account.
 */
export async function unlockSignup(
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const typed = String(formData.get("passcode") ?? "");
  if (!typed.trim()) return { error: "Escribe el código." };

  const signed = passcodeAccepted(typed);
  if (!signed) {
    // Deliberately not "that code is wrong" versus "registration is closed".
    // Somebody guessing should not learn which of the two they are up against.
    return { error: "Ese código no es válido." };
  }

  const jar = await cookies();
  jar.set(GATE_COOKIE, signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_MAX_AGE,
  });

  return {};
}
