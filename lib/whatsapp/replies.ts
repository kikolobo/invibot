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
  /** Their +1 by name, when we already have it — then nobody asks again. */
  companionName?: string | null;
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
    // Asked here because this is the moment they are holding the thread. The
    // approved template cannot ask it, which is fine: whoever falls back to it
    // can still be asked by the assistant later.
    ...(withCompanion && !facts.companionName
      ? ["", "¿Cómo se llama quien te acompaña? Así lo anoto en la lista."]
      : []),
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

/**
 * Mirrors the `acceso_evento` pair, for a guest whose window happens to be open
 * the morning before — same words, no charge, and the pass follows without
 * waiting for a tap.
 */
export function dayBeforeReply(
  facts: Pick<ReplyFacts, "name" | "eventName"> & { time: string; where: string },
  withCompanion: boolean,
): string {
  return [
    "¡Es mañana! 🎉",
    "",
    withCompanion
      ? `Hola ${facts.name}, te esperamos mañana en ${facts.eventName} con tu acompañante.`
      : `Hola ${facts.name}, te esperamos mañana en ${facts.eventName}.`,
    "",
    `🕐 ${facts.time}`,
    `📍 ${facts.where}`,
    "",
    withCompanion
      ? "Aquí van sus accesos para que los tengan a la mano en la entrada."
      : "Aquí va tu acceso para que lo tengas a la mano en la entrada.",
  ].join("\n");
}

/**
 * The one nudge a self-registered guest gets when their invitation goes
 * unanswered — free-form, because their own registration opened the window, and
 * with the invitation's own buttons, which cost nothing inside it.
 */
export function rsvpReminderReply(
  facts: Pick<ReplyFacts, "name" | "eventName" | "when">,
  withCompanion: boolean,
): string {
  return [
    `Hola ${facts.name} 👋`,
    "",
    `¿Nos confirmas si podrás acompañarnos a ${facts.eventName}?`,
    "",
    `📅 ${facts.when}`,
    "",
    withCompanion
      ? "Tu invitación incluye un lugar para ti y un acompañante. Contéstame aquí abajo 👇"
      : "Contéstame aquí abajo 👇",
  ].join("\n");
}

/**
 * Why a guest asking for their passes did not get them. Only for the button
 * path — the assistant is handed the same reasons and says it in its own words.
 */
export function passesUnavailableReply(
  reason: "disabled" | "not_confirmed" | "too_early" | "over" | "failed",
): string {
  switch (reason) {
    case "too_early":
      return "Tu acceso te llega por aquí un día antes del evento 🙌";
    case "not_confirmed":
      return "Todavía no tengo tu asistencia confirmada. ¿Vas a poder venir?";
    case "over":
      return "Este evento ya pasó. ¡Gracias por acompañarnos! 💛";
    case "disabled":
      return "Para este evento no necesitas un acceso: basta con tu nombre en la entrada.";
    case "failed":
      return "Tuve un problema para mandarte tu acceso. Vuelve a tocar el botón en un momento, por favor 🙏";
  }
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
