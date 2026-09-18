/**
 * The four things you can do with a question.
 *
 * Only two carry colour: the one that saves and the one that throws away. Four
 * coloured buttons in a row read as a warning panel — the row is quieter with
 * the middle two in grey, and red means more when it is the only red.
 *
 * Shared so the same action never looks different depending on whether the
 * question has been answered yet.
 */
const base =
  "rounded-full px-4 py-1.5 text-[0.82rem] transition-colors disabled:opacity-50";

// `bg-line/70` was invisible on this paper: the line colour at 70% over the
// page lands
// within a hair of the page, so the grey actions stopped reading as buttons at
// all and sat there looking like labels. A pill has to have an edge.
const grey = `${base} bg-stone-300 text-stone-800 hover:bg-stone-400`;

export const buttonStyles = {
  /** Saves the answer and tells whoever asked. */
  save: `${base} bg-blue-700 text-white hover:bg-blue-800`,
  /** Backs out, changing nothing. */
  cancel: grey,
  /** Still an answer, just not one anybody gets — so it sits with cancel. */
  unavailable: grey,
  /** Throws the question away. The only red, because it is the only one that loses something. */
  discard: `${base} bg-red-700 text-white hover:bg-red-800`,
} as const;
