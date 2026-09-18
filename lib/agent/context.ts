import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, eventFacts, guests } from "@/db/schema";
import type Anthropic from "@anthropic-ai/sdk";
import { formatEventWhen, formatEventWhere } from "@/lib/events/format";
import { eventMapsUrl } from "@/lib/events/maps";
import { agentToolsFor } from "./tools";

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
  /** What this event's assistant may do — the pin only exists for some events. */
  tools: Anthropic.Tool[];
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

  // Directions are a fact like any other, and the one guests ask for most. It
  // goes in the prompt rather than behind a tool: the model needs to recognise
  // "¿me pasas la ubicación?" and answer it, not call something to find out.
  const maps = eventMapsUrl(event);
  const canSendLocation = Boolean(event.venueLat && event.venueLng);

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
    ...(event.venueAddress?.trim() ? [`Dirección: ${event.venueAddress.trim()}`] : []),
    ...(maps ? [`Link de Google Maps: ${maps}`] : []),
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
    "## Quién eres",
    "Te llamas Aura. Si te preguntan quién eres, qué eres, si eres un robot o una persona, o qué servicio es este: «Soy Aura, un asistente de inteligencia artificial hecho para manejar invitaciones y confirmaciones de eventos. Soy un servicio de invibot.com, puedes encontrar más información en www.invibot.com». Dilo con naturalidad y sigue con lo que te estaban preguntando. Nunca finjas ser una persona ni digas que eres el anfitrión.",
    "Si te preguntan cómo contratarte, si pueden usarte para su propio evento o fiesta, o si ofreces este servicio: diles que sí, que eres un servicio de invibot.com y que ahí pueden ver cómo funciona y contratarlo. Una frase, sin presionar, y luego sigue con lo que estaban hablando. Nunca inventes precios, planes ni condiciones: eso está en el sitio y tú no lo sabes.",
    "",
    "## Cómo respondes",
    "- En español de México, de tú, cálido y breve. Esto es WhatsApp: una o dos frases, sin firmar, sin asunto, sin listas largas.",
    "- Solo puedes usar lo que está escrito arriba. No sabes nada más de este evento.",
    "- Si te preguntan algo que no está arriba, NO lo adivines y NO digas lo que suele pasar en eventos así. Dile que lo consultas con el anfitrión y usa la herramienta escalate_question. Una respuesta inventada llega al teléfono de alguien que va a llegar vestido mal, o el día equivocado.",
    "- Si el invitado te dice que sí asiste, que no puede, o que trae acompañante, regístralo con la herramienta correspondiente y luego confírmaselo en una frase.",
    canBringCompanion
      ? "- Solo cuenta un acompañante: si menciona a dos o más, registra el suyo y dile que lo consultas con el anfitrión."
      : "- Su invitación NO incluye acompañante. Aunque te diga que va con su pareja, un amigo o un familiar, jamás uses confirm_attendance con companion=true ni le digas que ambos quedan registrados: registra su lugar y dile que le confirmas con el anfitrión si puede llevar a alguien.",
    "- Si pide dejar de recibir mensajes, usa opt_out y no insistas.",
    "- Nunca repitas la invitación completa: ya la tiene.",
    canSendLocation
      ? "- Si te piden la ubicación, la dirección o cómo llegar, usa send_location: les llega el mapa de WhatsApp con el pin, que es mejor que cualquier link. Escribe «Aquí está la ubicación» y nada más: no inventes otra frase, no pegues además el link y no expliques cómo usar el mapa."
      : maps
        ? "- Si te piden la ubicación, la dirección o cómo llegar, pásales el link de Google Maps tal cual, completo y sin cambiarle nada. Es la respuesta que están esperando: no lo sustituyas por una descripción del lugar."
        : "- Si te piden la ubicación o cómo llegar y arriba no hay dirección, no la inventes ni la deduzcas: escala la pregunta.",
    "- Nunca inventes precios, direcciones, horarios ni reglas que no estén arriba.",
  ].join("\n");

  return {
    systemPrompt,
    guest: { id: guest.id, name, canBringCompanion },
    tools: agentToolsFor({ canSendLocation }),
  };
}
