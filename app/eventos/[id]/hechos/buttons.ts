/**
 * The four things you can do with a question, in the four colours they mean.
 *
 * Shared so the same action never looks different depending on whether the
 * question has been answered yet — the buttons sit in two places and a guest's
 * question does not change what "descartar" costs.
 */
const base =
  "rounded-full px-4 py-1.5 text-[0.82rem] transition-colors disabled:opacity-50";

export const buttonStyles = {
  /** Saves the answer and tells whoever asked. */
  save: `${base} bg-emerald-700 text-white hover:bg-emerald-800`,
  /** Backs out, changing nothing. */
  cancel: `${base} bg-line/70 text-ink-soft hover:bg-line`,
  /** Withdraws the answer: still an answer, just not one anybody gets. */
  unavailable: `${base} bg-amber-600 text-white hover:bg-amber-700`,
  /** Throws the question away. Loud on purpose — nothing tells the guest. */
  discard: `${base} bg-red-700 text-white hover:bg-red-800`,
} as const;
