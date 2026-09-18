/**
 * What the assistant calls itself.
 *
 * One definition, because the name is said in two places that must agree: the
 * greeting sent after a guest confirms, and the answer to "¿quién eres?". Two
 * names for one thing is how a guest decides it is being handled by something
 * shifty, and that bug has already happened once here.
 *
 * An environment variable rather than a constant so it can be changed without a
 * code change — but with a default, so an environment that says nothing still
 * has a name rather than a blank.
 */
export function assistantName(): string {
  return process.env.ASSISTANT_NAME?.trim() || "Aura";
}
