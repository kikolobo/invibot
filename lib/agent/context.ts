import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, eventFacts, guests } from "@/db/schema";
import { formatEventWhen, formatEventWhere } from "@/lib/events/format";

type EventRow = typeof events.$inferSelect;
type GuestRow = typeof guests.$inferSelect;

/**
 * Everything the assistant is allowed to know.
 *
 * The rule this file exists to enforce: the assistant answers from the
 * organizer's own answers and nothing else. A model that knows what weddings
 * are like in general will happily invent a dress code, and a guest has no way
 * to tell an invented answer from a real one — they just show up wrong.
 *
 * Internal facts never appear here. They are the organizer's notes to
 * themselves, shown under "Sólo para ti", and a guest must never read them
 * back out of the assistant.
 */

export type AgentContext = {
  systemPrompt: string;
  guest: { id: string; name: string; canBringCompanion: boolean };
};

const rsvpWords: Record<string, string> = {
  no_response: "todavía no responde",
  confirmed: "ya confirmó que asiste",
  declined: "ya dijo que no podrá ir",
  maybe: "dijo que tal vez",
  waitlist: "está en lista de espera",
};

export async function buildContext(
  event: EventRow,
  guest: GuestRow,
): Promise<AgentContext> {
  const facts = await db
    .select({ question: eventFacts.question, answer: eventFacts.answer })
    .from(eventFacts)
    .where(
      and(
        eq(eventFacts.eventId, event.id),
        eq(eventFacts.isActive, true),
        eq(eventFacts.visibility, "public"),
      ),
    )
    .orderBy(asc(eventFacts.createdAt));

  const name = guest.firstName?.trim() || guest.fullName.split(/\s+/)[0] || guest.fullName;
  const canBringCompanion = guest.partySizeAllowed >= 2;

  const knowledge =
    facts.length > 0
      ? facts.map((fact) => `P: ${fact.question}\nR: ${fact.answer}`).join("\n\n")
      : "(El anfitrión todavía no ha contestado ninguna pregunta.)";

  const systemPrompt = [
    `Eres el asistente de ${event.hostNames ?? "los anfitriones"} para su evento, y hablas con sus invitados por WhatsApp.`,
    "",
    "## El evento",
    `Nombre: ${event.name}`,
    `Cuándo: ${formatEventWhen(event)}`,
    `Dónde: ${formatEventWhere(event) || "Sin definir"}`,
    `Anfitriones: ${event.hostNames ?? "Sin definir"}`,
    "",
    "## Lo que el anfitrión ya contestó",
    knowledge,
    "",
    "## Con quién hablas",
    `${guest.fullName}, a quien llamas ${name}. Ahora mismo ${rsvpWords[guest.rsvpStatus] ?? "no sabemos si asiste"}.`,
    canBringCompanion
      ? "Su invitación incluye un lugar para un acompañante."
      : "Su invitación es para una sola persona; no puede traer acompañante.",
    "",
    "## Cómo respondes",
    "- En español de México, de tú, cálido y breve. Esto es WhatsApp: una o dos frases, sin firmar, sin asunto, sin listas largas.",
    "- Solo puedes usar lo que está escrito arriba. No sabes nada más de este evento.",
    "- Si te preguntan algo que no está arriba, NO lo adivines y NO digas lo que suele pasar en eventos así. Dile que lo consultas con el anfitrión y usa la herramienta escalate_question. Una respuesta inventada llega al teléfono de alguien que va a llegar vestido mal, o el día equivocado.",
    "- Si el invitado te dice que sí asiste, que no puede, o que trae acompañante, regístralo con la herramienta correspondiente y luego confírmaselo en una frase.",
    "- Si pide dejar de recibir mensajes, usa opt_out y no insistas.",
    "- Nunca repitas la invitación completa: ya la tiene.",
    "- Nunca inventes precios, direcciones, horarios ni reglas que no estén arriba.",
  ].join("\n");

  return {
    systemPrompt,
    guest: { id: guest.id, name, canBringCompanion },
  };
}
