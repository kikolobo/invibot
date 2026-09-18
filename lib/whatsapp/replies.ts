/**
 * What we write back to a guest, as plain strings.
 *
 * Pure and database-free so the organizer's preview can render the exact words
 * the webhook will send. A preview built from its own copy is a preview that
 * drifts, and the whole point of showing it is that nobody has to guess what
 * lands on a guest's phone.
 */

export type ReplyFacts = {
  /** What the message calls the guest — first name where we have one. */
  name: string;
  eventName: string;
  /** Already formatted in the event's timezone by `formatEventWhen`. */
  when: string;
  where: string;
  /** The venue and the street, one per line. Free-form sends allow newlines. */
  addressLines?: string[];
  /** Google Maps, when the event has an address. Omitted rather than faked. */
  mapsUrl?: string | null;
  /**
   * What the assistant calls itself.
   *
   * Passed in rather than read from the environment, because this file is
   * rendered in the browser by the organizer's preview — where `process.env` is
   * empty and the name would silently fall back to the default while WhatsApp
   * sent the real one. A preview that quietly disagrees with the message is
   * worse than no preview.
   */
  assistant: string;
};

/**
 * Mirrors the `confirmacion_rsvp` template, which goes out in its place when the
 * service window has closed. The two should read the same.
 */
export function confirmationReply(facts: ReplyFacts, withCompanion: boolean): string {
  return [
    `Listo ${facts.name} ✅`,
    "",
    withCompanion
      ? `Tu lugar y el de tu acompañante están confirmados para ${facts.eventName}.`
      : `Tu lugar está confirmado para ${facts.eventName}.`,
    "",
    `📅 ${facts.when}`,
    ...(facts.addressLines?.length
      ? [`📍 ${facts.addressLines[0]}`, ...facts.addressLines.slice(1)]
      : [`📍 ${facts.where}`]),
    ...(facts.mapsUrl ? [`🗺️ Cómo llegar: ${facts.mapsUrl}`] : []),
    "",
    // The assistant introduces itself here rather than in a message of its own.
    // A confirmation is the one moment a guest is both paying attention and
    // holding a thread they can reply to; a second message a beat later is just
    // another notification to swipe away.
    `Yo soy ${facts.assistant} ✨, Planner IA del evento. Avísame si tienes alguna duda.`,
    "¡Pregúntame lo que quieras! 💫",
  ].join("\n");
}

export function declineReply(facts: ReplyFacts): string {
  return [
    `Gracias por avisar, ${facts.name}. Te vamos a extrañar en ${facts.eventName} 💛`,
    "",
    "Si tus planes cambian, escríbeme por aquí.",
  ].join("\n");
}


/**
 * An answer arriving after the fact, for a question asked hours ago.
 *
 * It repeats the question on purpose. The reply lands cold in a thread the
 * guest has scrolled past, and an answer with no question attached — "No, no
 * se pueden" — reads as a non sequitur or, worse, as an answer to something
 * else they asked.
 */
export function relayedAnswer(question: string, answer: string): string {
  return [`Ya tengo respuesta 🙌`, "", `Preguntaste: ${question}`, "", answer].join("\n");
}


/**
 * A correction to something already answered.
 *
 * Says plainly that it changed rather than restating the answer as if it were
 * new: the guest acted on the first one, and "the dress code is X" a second
 * time reads as a duplicate they can ignore.
 */
export function updatedAnswer(question: string, answer: string): string {
  return [
    "Una corrección sobre algo que preguntaste 🙏",
    "",
    `Preguntaste: ${question}`,
    "",
    `La respuesta correcta es: ${answer}`,
  ].join("\n");
}


/**
 * The organizer declined to answer.
 *
 * It does not pretend to be an answer — "ya tengo respuesta" followed by a
 * refusal reads worse than the refusal alone — and it closes the loop, because
 * the guest was told someone would get back to them.
 */
export function unavailableAnswer(question: string, reason: string): string {
  return [
    "Sobre lo que preguntaste 🙏",
    "",
    question,
    "",
    reason,
    "",
    "Cualquier otra duda, aquí estoy.",
  ].join("\n");
}
