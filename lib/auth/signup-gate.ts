import { createHmac, timingSafeEqual } from "node:crypto";

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
function token(): string | null {
  const code = process.env.SIGNUP_PASSCODE?.trim();
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!code || !secret) return null;
  return createHmac("sha256", secret).update(`signup:${code}`).digest("hex");
}

const sameString = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** True when the typed code is the configured one. Constant-time. */
export function passcodeAccepted(typed: string): string | null {
  const code = process.env.SIGNUP_PASSCODE?.trim();
  const signed = token();
  if (!code || !signed) return null;
  return sameString(typed.trim(), code) ? signed : null;
}

/** True when this cookie was minted by us for the current passcode. */
export function gateOpen(cookieValue: string | undefined): boolean {
  const signed = token();
  if (!signed || !cookieValue) return false;
  return sameString(cookieValue, signed);
}

/** Whether a passcode is configured at all. Unset means the door is shut. */
export const gateConfigured = () => token() !== null;
