/**
 * How many seats one invitation can carry.
 *
 * The ceiling is 2 because that is what the invitation can *say*: WhatsApp
 * allows three quick replies, and `invitacion_evento_acompanante` spends them
 * on "Asistiré solo", "Con +1" and "No asistiré". A party of four has no button
 * that expresses it, and an invitation the guest cannot answer is worse than
 * one that never offered.
 *
 * The column is a plain integer and stays that way — raising this constant is
 * what larger parties will need, once there is a template or a conversation
 * that can ask "¿cuántos vienen?".
 */
export const MAX_PARTY_SIZE = 2;

/**
 * `allowPlusOnes` is the human-facing switch; `maxPartySize` is the number the
 * rest of the system reads. Turning the switch on means exactly two seats, so
 * the number is derived rather than asked for twice — the two fields drifting
 * apart is how an event ends up offering companions with a maximum of one.
 */
export function resolveMaxPartySize(allowPlusOnes: boolean, requested: number): number {
  if (allowPlusOnes) return MAX_PARTY_SIZE;
  return Math.min(Math.max(requested, 1), MAX_PARTY_SIZE);
}
