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
 * Companions are a yes or a no, never a number to type.
 *
 * The column stays an integer for the day larger parties are supported, but
 * nothing in the interface asks for a count: with a ceiling of two, a number
 * input is a spinner with two positions, and it invited the contradiction this
 * project already hit once — companions allowed, maximum of one.
 */
export function partySizeFor(allowPlusOnes: boolean): number {
  return allowPlusOnes ? MAX_PARTY_SIZE : 1;
}
