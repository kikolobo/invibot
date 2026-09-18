/**
 * What an organizador can ask us, and how we recognise it.
 *
 * Commands rather than a model, for three reasons that all matter. It settles
 * who is talking: an organizador who is also a guest sends a command as staff
 * and anything else as a guest, with no heuristic in between. It costs nothing
 * per message, and an organizador can ask all day. And it is exhaustively
 * testable, which the thing standing between a guest list and a phone number
 * ought to be.
 *
 * Slashes are the canonical form because `/ayuda` can teach them. Nobody types
 * slashes, so the bare word works too — but only as the entire message. A guest
 * writing "ya confirmé, gracias" must never trip a command, which is why this
 * never looks for a word *inside* a sentence.
 */

export type OrganizerCommand =
  | "confirmados"
  | "invitados"
  | "cancelados"
  | "liga"
  | "lista_confirmados"
  | "lista_cancelados"
  | "lista_sin_respuesta"
  | "ayuda";

const WORDS: Record<string, OrganizerCommand> = {
  confirmados: "confirmados",
  confirmadas: "confirmados",
  confirmed: "confirmados",
  invitados: "invitados",
  invitadas: "invitados",
  guests: "invitados",
  lista: "invitados",
  cancelados: "cancelados",
  canceladas: "cancelados",
  cancelled: "cancelados",
  canceled: "cancelados",
  bajas: "cancelados",
  // The link a host pastes into their groups. Asked for as /registerlink, and
  // answered to the Spanish forms too because the rest of this vocabulary is
  // Spanish and nobody will remember which one this was.
  registerlink: "liga",
  liga: "liga",
  link: "liga",
  autorregistro: "liga",
  autoregistro: "liga",
  registro: "liga",
  // The same three counts, but by name. Written with hyphens and matched after
  // spaces are folded into them, so "lista confirmados" works as well.
  "lista-confirmados": "lista_confirmados",
  "listar-confirmados": "lista_confirmados",
  "lista-cancelados": "lista_cancelados",
  "listar-cancelados": "lista_cancelados",
  "lista-bajas": "lista_cancelados",
  "lista-sin-respuesta": "lista_sin_respuesta",
  "listar-sin-respuesta": "lista_sin_respuesta",
  "lista-pendientes": "lista_sin_respuesta",
  "sin-respuesta": "lista_sin_respuesta",
  ayuda: "ayuda",
  help: "ayuda",
  menu: "ayuda",
  comandos: "ayuda",
};

const fold = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * The command in this message, or null when it is not one.
 *
 * Null is the common case and the important one: it is what sends an
 * organizador who is also a guest down the ordinary path, still talking to the
 * assistant about the party they are attending.
 */
export function parseCommand(text: string | null): OrganizerCommand | null {
  if (!text) return null;

  const cleaned = fold(text).replace(/[¿?¡!.,;:]/g, "").trim();
  if (!cleaned) return null;

  // A leading slash is the canonical form and is allowed to be the whole
  // message on its own.
  const word = cleaned.startsWith("/") ? cleaned.slice(1).trim() : cleaned;

  // Whole message only. "cuantos confirmados" is a question a person really
  // types, so a two-word form with a leading interrogative is allowed too.
  const bare = word.replace(/^(cuantos|cuantas|cuanta|cuanto|dime|dame|quienes|quien)\s+/, "");

  // Spaces, hyphens and underscores are the same thing to somebody typing on a
  // phone: "lista confirmados", "lista-confirmados" and "lista_confirmados" are
  // one command. Folded after the interrogative is stripped, so "cuantos
  // confirmados" does not become "cuantos-confirmados" and stop matching.
  const key = bare.replace(/[\s_-]+/g, "-");

  return WORDS[key] ?? null;
}

export type Counts = {
  eventName: string;
  /** Guests who said yes. */
  confirmed: number;
  /** Seats those guests confirmed, companions included. */
  seats: number;
  /** Everybody on the list who has been let in. */
  invited: number;
  declined: number;
  /** Self-registered and still waiting on a decision. */
  pending: number;
};

const line = (counts: Counts, body: string) => `${counts.eventName}\n${body}`;

export function formatCounts(command: OrganizerCommand, counts: Counts): string {
  switch (command) {
    case "confirmados":
      return line(
        counts,
        `${counts.confirmed} ${counts.confirmed === 1 ? "confirmado" : "confirmados"} · ` +
          `${counts.seats} ${counts.seats === 1 ? "lugar" : "lugares"}`,
      );
    case "invitados":
      return line(
        counts,
        `${counts.invited} en la lista` +
          (counts.pending > 0 ? `\n${counts.pending} esperando tu aprobación` : ""),
      );
    case "cancelados":
      return line(
        counts,
        `${counts.declined} ${counts.declined === 1 ? "cancelado" : "cancelados"}`,
      );
    case "lista_confirmados":
    case "lista_cancelados":
    case "lista_sin_respuesta":
      // Built from names, not counts, so it never reaches here.
      return HELP;
    case "liga":
      // Built from the event rather than counted, so it never reaches here.
      return HELP;
    case "ayuda":
      return HELP;
  }
}

/**
 * The self-registration link, or why there isn't one.
 *
 * An organizador asking for this is about to paste it somewhere, so the reply
 * is the bare link on its own line — anything wrapped around it gets copied by
 * accident.
 */
export function formatLink(eventName: string, link: string | null): string {
  if (!link) {
    return `${eventName}\nEste evento no tiene autorregistro prendido. Se activa en Generales.`;
  }
  return `${eventName}\nCompárteles esta liga para que se registren solos:\n${link}`;
}

export const HELP = [
  "Esto es lo que puedo decirte:",
  "",
  "/confirmados — cuántos van y cuántos lugares",
  "/invitados — cuántos hay en la lista",
  "/cancelados — cuántos no van",
  "/registerlink — la liga de autorregistro para compartir",
  "",
  "Y por nombre:",
  "/lista-confirmados · /lista-cancelados · /lista-sin-respuesta",
  "",
  "También entiendo «cuántos confirmados» sin la diagonal.",
].join("\n");


/**
 * A plain list of names.
 *
 * Names and nothing else. An organizador reading this on a phone is checking
 * names off against something in their head, and a phone number or a group
 * beside each one is noise they have to read past every line.
 *
 * Capped, because WhatsApp has a message limit and an event with three hundred
 * guests would otherwise produce a message that fails to send rather than a
 * long one.
 */
const MAX_NAMES = 120;

export function formatNames(
  eventName: string,
  heading: string,
  /** Said when the list is empty — "nadie cancelados" is not a sentence. */
  empty: string,
  names: string[],
): string {
  if (names.length === 0) return `${eventName}\n${empty}`;

  const shown = names.slice(0, MAX_NAMES);
  const rest = names.length - shown.length;

  return [
    `${eventName}`,
    `${names.length} ${heading}:`,
    "",
    ...shown.map((name) => `* ${name}`),
    ...(rest > 0 ? ["", `…y ${rest} más.`] : []),
  ].join("\n");
}
