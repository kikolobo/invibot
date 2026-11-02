import { and, count, eq, gt, inArray, isNotNull, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { escalations, events, guests, organizerFocus, organizers } from "@/db/schema";
import { formatEventDate } from "@/lib/events/format";
import { applyEscalationAnswer } from "@/lib/agent/escalations";
import { eventIsOver } from "@/lib/events/timing";
import { normalizePhone, variantsOf } from "@/lib/phone";
import {
  parseCommand,
  parseSwitch,
  formatCounts,
  formatLink,
  formatNames,
  type Counts,
  type OrganizerCommand,
} from "./commands";
import { registrationLink } from "@/lib/guests/auto-register";
import { formatReport, reportFor } from "./report";

type OrganizerRow = typeof organizers.$inferSelect;
type EventRow = typeof events.$inferSelect;

/**
 * How long after an event ends it still answers to its organizadores: the
 * morning-after "¿cómo nos fue?" and the last guest questions still in flight.
 */
const AFTER_EVENT_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The events this number helps run.
 *
 * Archived ones are left out: an organizador asking for counts means the party
 * that is still happening, and an archived event answering alongside a live one
 * is noise at best. So are events long over and never archived — a /reporte in
 * November has no business carrying an October party's numbers.
 */
export async function organizerEvents(
  phoneE164: string,
): Promise<{ organizer: OrganizerRow; event: EventRow }[]> {
  // Matching the stored canonical form against every shape the webhook might
  // send, which is the same trick `resolveGuest` uses — Meta is inconsistent
  // about the legacy "1" after +52.
  const candidates = variantsOf(phoneE164);

  const rows = await db
    .select({ organizer: organizers, event: events })
    .from(organizers)
    .innerJoin(events, eq(events.id, organizers.eventId))
    .where(inArray(organizers.phoneE164, candidates));

  const cutoff = Date.now() - AFTER_EVENT_MS;
  return rows
    .filter((row) => row.event.archivedAt === null && !eventIsOver(row.event, cutoff))
    // By date, so /eventos numbers them the same way every time it is asked.
    .sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime());
}

/** The event this number chose with /cambiar, while it is still one of theirs. */
async function focusOf(
  phoneE164: string,
  mine: { event: EventRow }[],
): Promise<string | null> {
  const [row] = await db
    .select({ eventId: organizerFocus.eventId })
    .from(organizerFocus)
    .where(inArray(organizerFocus.phoneE164, variantsOf(phoneE164)))
    .limit(1);
  return row && mine.some(({ event }) => event.id === row.eventId) ? row.eventId : null;
}

/**
 * The events a command or a shared contact means: the one chosen with
 * /cambiar, or all of them when there is no choice — or it has ended, or
 * they were taken off it, which quietly goes back to all.
 */
export async function scopedEvents(
  phoneE164: string,
): Promise<{ organizer: OrganizerRow; event: EventRow }[]> {
  const mine = await organizerEvents(phoneE164);
  if (mine.length <= 1) return mine;
  const focus = await focusOf(phoneE164, mine);
  return focus ? mine.filter(({ event }) => event.id === focus) : mine;
}

const eventLine = (event: EventRow) =>
  `${event.name} · ${formatEventDate(event)}`;

/** /eventos, and /cambiar without a number. */
async function listEvents(phoneE164: string, mine: { event: EventRow }[]): Promise<string> {
  const focus = await focusOf(phoneE164, mine);
  const lines = mine.map(
    ({ event }, index) => `${event.id === focus ? "▶" : " "} ${index + 1}) ${eventLine(event)}`,
  );
  if (mine.length === 1) return `Llevas un evento:

${lines[0].trim()}`;
  return [
    "Tus eventos:",
    "",
    ...lines,
    "",
    focus
      ? "▶ es el que estás viendo. /cambiar y el número para otro, o /cambiar todos."
      : "Ahora te contesto por todos. Escríbeme /cambiar y el número para trabajar en uno.",
  ].join("\n");
}

/** /cambiar: which event the following commands are about. */
async function switchEvent(
  phoneE164: string,
  mine: { event: EventRow }[],
  target: number | "todos" | null,
): Promise<string> {
  if (target === null || mine.length === 1) return listEvents(phoneE164, mine);

  // Stored canonical; read back through every variant Meta might send.
  const canonical = normalizePhone(phoneE164)?.e164 ?? phoneE164;
  if (target === "todos") {
    await db.delete(organizerFocus).where(inArray(organizerFocus.phoneE164, variantsOf(phoneE164)));
    return "Listo, te contesto por todos tus eventos.";
  }

  const chosen = mine[target - 1]?.event;
  if (!chosen) return `No tengo el evento ${target}.\n\n${await listEvents(phoneE164, mine)}`;

  await db.delete(organizerFocus).where(inArray(organizerFocus.phoneE164, variantsOf(phoneE164)));
  await db.insert(organizerFocus).values({ phoneE164: canonical, eventId: chosen.id, updatedAt: new Date() });
  return `Listo, ahora estás en *${chosen.name}*. Lo que me pidas —reportes, listas, contactos— es de este evento.`;
}

/**
 * The names behind one of the counts, alphabetical.
 *
 * Approved guests only, like every other number here: somebody still waiting on
 * a decision is not on the list yet, and reading their name among the confirmed
 * would be wrong twice over.
 */
async function namesFor(eventId: string, command: OrganizerCommand): Promise<string[]> {
  const rsvp =
    command === "lista_confirmados"
      ? "confirmed"
      : command === "lista_cancelados"
        ? "declined"
        : "no_response";

  const rows = await db
    .select({ fullName: guests.fullName })
    .from(guests)
    .where(
      and(
        eq(guests.eventId, eventId),
        eq(guests.approvalStatus, "approved"),
        eq(guests.rsvpStatus, rsvp),
      ),
    );

  return rows.map((row) => row.fullName).sort((a, b) => a.localeCompare(b, "es"));
}

const LISTS: Record<string, { heading: string; empty: string }> = {
  lista_confirmados: { heading: "confirmados", empty: "Todavía no confirma nadie." },
  lista_cancelados: { heading: "cancelados", empty: "Nadie ha cancelado." },
  lista_sin_respuesta: { heading: "sin responder", empty: "Ya todos respondieron." },
};

/** The counts one event can answer with. */
export async function countsFor(event: EventRow): Promise<Counts> {
  const approved = and(eq(guests.eventId, event.id), eq(guests.approvalStatus, "approved"));

  const [totals] = await db
    .select({
      invited: count(),
      confirmed: raw<number>`count(*) filter (where ${guests.rsvpStatus} = 'confirmed')::int`,
      declined: raw<number>`count(*) filter (where ${guests.rsvpStatus} = 'declined')::int`,
      seats: raw<number>`coalesce(sum(${guests.partySizeConfirmed}) filter (where ${guests.rsvpStatus} = 'confirmed'), 0)::int`,
    })
    .from(guests)
    .where(approved);

  const [{ pending }] = await db
    .select({ pending: count() })
    .from(guests)
    .where(and(eq(guests.eventId, event.id), eq(guests.approvalStatus, "pending")));

  return {
    eventName: event.name,
    invited: totals?.invited ?? 0,
    confirmed: totals?.confirmed ?? 0,
    declined: totals?.declined ?? 0,
    seats: totals?.seats ?? 0,
    pending,
  };
}

/**
 * An organizador asking us something, or nothing at all.
 *
 * Null means this message is not a command, which is the answer most of the
 * time — including for an organizador who is also a guest and is simply asking
 * about the party they are attending. That message belongs to the assistant and
 * this must not take it.
 *
 * Every organizador may ask; only the one marked as responder is *asked*. The
 * two powers are deliberately separate, so a guest's question reaches one phone
 * while the counts reach whoever wants them.
 */
export async function organizerReply(
  phoneE164: string,
  text: string | null,
): Promise<string | null> {
  const switching = parseSwitch(text);
  const command = switching ? null : parseCommand(text);
  if (!switching && !command) return null;

  const all = await organizerEvents(phoneE164);
  if (all.length === 0) return null;

  if (switching) return switchEvent(phoneE164, all, switching.target);
  if (!command) return null;
  if (command === "eventos") return listEvents(phoneE164, all);

  const mine = await scopedEvents(phoneE164);

  if (command === "ayuda") return formatCounts("ayuda", await countsFor(mine[0].event));

  const list = LISTS[command];
  if (list) {
    const lines: string[] = [];
    for (const { event } of mine.slice(0, 5)) {
      lines.push(
        formatNames(event.name, list.heading, list.empty, await namesFor(event.id, command)),
      );
    }
    return lines.join("\n\n");
  }

  if (command === "reporte") {
    // El mismo texto que sale solo a las 11:00, para que pedirlo y recibirlo
    // no se vean como dos cosas distintas.
    const lines: string[] = [];
    for (const { event } of mine.slice(0, 5)) {
      lines.push(formatReport(await reportFor(event)));
    }
    // Cada corte ya trae un renglón en blanco por dentro, así que entre uno y
    // otro hace falta algo más que eso para ver dónde empieza el siguiente.
    return lines.join("\n\n━━━━━━━━━━\n\n");
  }

  if (command === "liga") {
    return mine
      .slice(0, 5)
      .map(({ event }) =>
        formatLink(event.name, event.autoRegisterEnabled ? registrationLink(event) : null),
      )
      .join("\n\n");
  }

  // Answered for every event they run rather than asking which one. Asking
  // costs a round trip to produce information we already have, and an
  // organizador with two weddings this month wants both numbers anyway.
  const lines: string[] = [];
  for (const { event } of mine.slice(0, 5)) {
    lines.push(formatCounts(command, await countsFor(event)));
  }
  if (mine.length > 5) lines.push(`…y ${mine.length - 5} eventos más.`);

  return lines.join("\n\n");
}

export { parseCommand } from "./commands";

/**
 * An organizador answering a guest's question on WhatsApp.
 *
 * The answer is tied to the question by WhatsApp's own quote — the `wamid` of
 * the message they replied to, stored on the escalation when we sent it. Exact,
 * with nothing to parse and nothing to guess. An organizador with two open
 * questions who sends a bare "sí se puede" is answering one of them and we have
 * no way to know which, so they are asked to quote rather than have it attached
 * to the wrong one and relayed to guests.
 *
 * Returns what to say back, or null when this is not an organizador speaking as
 * one — in which case the message belongs to whatever comes next.
 */
/**
 * How long after asking a message still reads as an attempt to answer.
 *
 * Long enough for somebody who was driving when the question arrived, short
 * enough that tomorrow's unrelated message is not answered with a lecture about
 * quoting.
 */
const NUDGE_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function organizerAnswer(
  phoneE164: string,
  text: string | null,
  contextWamid: string | null,
): Promise<string | null> {
  const answer = text?.trim();
  if (!answer) return null;

  const mine = await organizerEvents(phoneE164);
  if (mine.length === 0) return null;

  const eventIds = mine.map((row) => row.event.id);

  if (contextWamid) {
    const [quoted] = await db
      .select()
      .from(escalations)
      .where(
        and(
          eq(escalations.organizerWamid, contextWamid),
          inArray(escalations.eventId, eventIds),
        ),
      )
      .limit(1);

    if (quoted) {
      if (quoted.status === "answered") {
        return "Esa pregunta ya se contestó. Si quieres cambiar la respuesta, hazlo desde la app.";
      }
      const result = await applyEscalationAnswer(quoted.id, answer);
      return result.error ?? "Listo, ya le compartí tu respuesta. El asistente también la aprendió.";
    }
  }

  // They said something that is not a command and not a quoted answer. Worth a
  // nudge only if we asked them something *recently*: a question open since
  // yesterday does not make every message today an attempt to answer it, and
  // the responder is often the host, who may also be a guest with an ordinary
  // conversation to have.
  const [waiting] = await db
    .select()
    .from(escalations)
    .where(
      and(
        inArray(escalations.eventId, eventIds),
        eq(escalations.status, "open"),
        isNotNull(escalations.organizerWamid),
        gt(escalations.askedOrganizerAt, new Date(Date.now() - NUDGE_WINDOW_MS)),
      ),
    )
    .limit(1);

  if (!waiting) return null;

  return (
    "Para que tu respuesta llegue a la pregunta correcta, contéstala citando el mensaje " +
    "de la pregunta (mantén presionado el mensaje y elige «Responder»)."
  );
}
