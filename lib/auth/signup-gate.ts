import { createHmac, timingSafeEqual } from "node:crypto";
import { activePasscode, getSettings } from "@/lib/site/settings";

/**
 * The wall in front of creating an account.
 *
 * Registration works and is worth keeping shut for now: an account can send
 * WhatsApp messages that cost money, and this runs on a plan whose terms
 * exclude commercial use. A shared passcode is not authentication — it is a
 * door that a stranger who finds the URL cannot walk through.
 *
 * Enforced where the account is actually created, not only in the form. The
 * signup form calls better-auth's own endpoint, so a UI-only check is a check
 * anybody can skip with one request.
 *
 * The mode and the code live in `site_settings`, set from /admin; the old
 * SIGNUP_PASSCODE variable is the fallback until a code is saved there.
 *
 * Fails closed. With no passcode configured nobody can register — including,
 * briefly, us. That is the right direction for a gate: the cost of being locked
 * out is an environment variable, and the cost of being open is strangers
 * spending money in our WhatsApp account.
 */
export const GATE_COOKIE = "invibot_signup";

/** An hour is long enough to fill in a form and short enough to be worthless later. */
export const GATE_MAX_AGE = 60 * 60;

/**
 * What the cookie holds: the passcode signed with the app secret, never the
 * passcode itself. A cookie somebody copies out of their own browser is useless
 * anywhere the secret differs, and it reveals nothing to read.
 */
function token(code: string | null): string | null {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!code || !secret) return null;
  return createHmac("sha256", secret).update(`signup:${code}`).digest("hex");
}

const sameString = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** The signed cookie value when the typed code is the one in force. Constant-time. */
export async function passcodeAccepted(typed: string): Promise<string | null> {
  const settings = await getSettings();
  if (settings.signupMode !== "passcode") return null;
  const code = activePasscode(settings);
  const signed = token(code);
  if (!code || !signed) return null;
  return sameString(typed.trim(), code) ? signed : null;
}

/**
 * Whether this browser may create an account, by the site's rules alone —
 * invitations are a separate door, checked by the create hook.
 *
 * In `passcode` mode the cookie must have been minted for the code in force
 * now, so changing the code shuts out every half-filled form from the old one.
 */
export async function gateOpen(cookieValue: string | undefined): Promise<boolean> {
  const settings = await getSettings();
  if (settings.signupMode === "open") return true;
  if (settings.signupMode === "closed") return false;
  const signed = token(activePasscode(settings));
  if (!signed || !cookieValue) return false;
  return sameString(cookieValue, signed);
}

/** Whether a code can open the door at all right now. */
export async function gateConfigured(): Promise<boolean> {
  const settings = await getSettings();
  return settings.signupMode === "passcode" && token(activePasscode(settings)) !== null;
}
