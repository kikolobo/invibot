import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { events, guests, organizers, suppressions } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";
import { cleanName, looksLikeAName } from "@/lib/guests/auto-register";
import { recordGuestEvent } from "@/lib/guests/history";
import { organizerEvents } from "./index";
import type { SharedContact } from "@/lib/whatsapp/webhook";

/**
 * Dar de alta invitados compartiendo su contacto por WhatsApp.
 *
 * Para el anfitrión que va manejando y se acuerda de tres personas: comparte
 * los contactos y quedan en la lista, sin abrir la app y sin teclear teléfonos.
 *
 * Dos reglas que no se negocian. **Sólo organizadores**: el contacto que
 * comparte un invitado se descarta sin más, porque si no, cualquiera mete gente
 * a la fiesta de alguien más. Y **sólo contactos con WhatsApp**: si WhatsApp no
 * devuelve `wa_id`, ese número no está en WhatsApp y un invitado al que no se
 * le puede escribir no es un invitado, es una fila muerta en la lista.
 *
 * Nadie recibe invitación por esto. Entran aprobados y sin invitar, que es como
 * caen en "Enviar invitaciones pendientes" cuando el anfitrión decida.
 */

/** Lo que la libreta llama nombre y una lista de invitados no. */
const NICKNAMES =
  /^(mam[aá]|pap[aá]|abue(la|lo)?|t[ií][oa]|prim[oa]|herman[oa]|jefe|jefa|doc(tor|tora)?|lic|ing|arq|casa|oficina|trabajo|vecin[oa]|amig[oa]|novi[oa]|esposa|esposo|suegr[oa]|cuñad[oa]|yo)$/i;

const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Si ese nombre sirve para una lista de asistentes.
 *
 * "Mamá" y "Juan Plomero" son cómo los tiene guardados quien comparte, no cómo
 * se llaman. Un solo nombre pasa — media lista de invitados es "Ana" a secas —
 * pero un apodo de parentesco no, y eso se pregunta en vez de imprimirlo en la
 * puerta.
 */
export function usableName(raw: string | null): string | null {
  const name = raw ? cleanName(raw) : null;
  if (!name || !looksLikeAName(name)) return null;
  if (NICKNAMES.test(fold(name))) return null;
  return name;
}

export type ContactOutcome =
  | { kind: "added"; name: string }
  | { kind: "duplicate"; name: string }
  | { kind: "no_whatsapp"; name: string }
  | { kind: "suppressed"; name: string }
  | { kind: "needs_name"; name: string; phone: string }
  | { kind: "unusable"; name: string };

/** Lo que el organizador lee de vuelta, y lo que quedó pendiente de preguntar. */
export type ContactResult = {
  text: string;
  /** Contactos válidos cuyo nombre hay que preguntar, uno por uno. */
  asking: { phone: string; label: string }[];
  eventId: string;
};

/**
 * Procesa los contactos que compartió un organizador.
 *
 * Null significa "esto no es asunto mío": no es organizador, no compartió
 * contactos, o corre varios eventos y no sabemos a cuál — ese último caso se
 * contesta preguntando, no adivinando.
 */
export async function handleSharedContacts(args: {
  fromPhoneE164: string;
  contacts: SharedContact[];
}): Promise<ContactResult | null> {
  const { fromPhoneE164, contacts } = args;
  if (contacts.length === 0) return null;

  const mine = await organizerEvents(fromPhoneE164);
  if (mine.length === 0) return null;

  // Un solo evento vivo: no hay nada que preguntar. Con varios, preguntar es
  // más barato que equivocarse de fiesta.
  if (mine.length > 1) {
    const list = mine.map(({ event }, index) => `${index + 1}) ${event.name}`).join("\n");
    return {
      text: `¿A cuál de tus eventos los agrego?\n\n${list}\n\nContéstame con el número.`,
      asking: [],
      eventId: mine[0].event.id,
    };
  }

  const { event, organizer } = mine[0];
  return await addAll(event.id, event.name, organizer.fullName, contacts);
}

/** Da de alta lo que se pueda y arma el resumen. */
export async function addAll(
  eventId: string,
  eventName: string,
  organizerName: string,
  contacts: SharedContact[],
): Promise<ContactResult> {
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) return { text: "Ese evento ya no existe.", asking: [], eventId };

  const outcomes: ContactOutcome[] = [];
  const asking: { phone: string; label: string }[] = [];

  for (const contact of contacts) {
    const label = contact.name?.trim() || contact.phone || "un contacto";

    // Sin `wa_id` no está en WhatsApp, y todo lo que hacemos con un invitado
    // pasa por ahí.
    if (!contact.waId) {
      outcomes.push({ kind: "no_whatsapp", name: label });
      continue;
    }

    const normalized = normalizePhone(contact.waId) ?? normalizePhone(contact.phone ?? "");
    if (!normalized) {
      outcomes.push({ kind: "unusable", name: label });
      continue;
    }

    const existing = await db.query.guests.findFirst({
      where: and(eq(guests.eventId, eventId), inArray(guests.phoneE164, normalized.variants)),
    });
    if (existing) {
      outcomes.push({ kind: "duplicate", name: existing.fullName });
      continue;
    }

    // Quien pidió no recibir mensajes no entra: agregarlo sólo para que cada
    // envío falle después es peor que decirlo ahora.
    const blocked = await db.query.suppressions.findFirst({
      where: inArray(suppressions.phoneE164, normalized.variants),
    });
    if (blocked) {
      outcomes.push({ kind: "suppressed", name: label });
      continue;
    }

    const name = usableName(contact.name);
    if (!name) {
      // Válido salvo por el nombre: se pregunta en vez de imprimir "Mamá" en
      // la lista de la puerta.
      asking.push({ phone: normalized.e164, label });
      outcomes.push({ kind: "needs_name", name: label, phone: normalized.e164 });
      continue;
    }

    await addGuestFromContact(event.id, event.maxPartySize, name, normalized, organizerName);
    outcomes.push({ kind: "added", name });
  }

  return { text: summarize(eventName, outcomes), asking, eventId };
}

/** El alta en sí, con el historial diciendo de dónde salió. */
export async function addGuestFromContact(
  eventId: string,
  maxPartySize: number,
  fullName: string,
  phone: { e164: string; variants: string[] },
  organizerName: string,
): Promise<void> {
  const [guest] = await db
    .insert(guests)
    .values({
      eventId,
      fullName,
      firstName: fullName.split(/\s+/)[0] || null,
      phoneE164: phone.e164,
      phoneVariants: phone.variants,
      partySizeAllowed: maxPartySize,
      accessToken: nanoid(24),
      // Aprobado y sin invitar: el anfitrión ya decidió que esta persona va, y
      // cuándo se le invita es otra decisión, que toma en "Enviar invitaciones
      // pendientes".
      approvalStatus: "approved",
      approvedAt: new Date(),
      source: "contact",
      inviteStatus: "pending",
    })
    .onConflictDoNothing()
    .returning();

  if (!guest) return;

  await recordGuestEvent({
    guestId: guest.id,
    eventId,
    type: "contact_added",
    at: new Date(),
    source: "organizer",
    detail: { via: "contacto compartido", organizer: organizerName },
  });
}

/**
 * El resumen que lee el organizador.
 *
 * Los nombres, no los números: está comparando contra lo que tiene en la
 * cabeza, y "3 agregados" no le dice si el que faltaba entró.
 */
function summarize(eventName: string, outcomes: ContactOutcome[]): string {
  const of = (kind: ContactOutcome["kind"]) =>
    outcomes.filter((outcome) => outcome.kind === kind).map((outcome) => outcome.name);

  const added = of("added");
  const duplicate = of("duplicate");
  const noWhatsApp = of("no_whatsapp");
  const suppressed = of("suppressed");
  const unusable = of("unusable");

  const lines: string[] = [`${eventName}`];

  if (added.length > 0) {
    lines.push("", `✅ Agregados sin invitar: ${added.join(", ")}`);
  }
  if (duplicate.length > 0) lines.push("", `Ya estaban en la lista: ${duplicate.join(", ")}`);
  if (noWhatsApp.length > 0) {
    lines.push("", `Sin WhatsApp, no los agregué: ${noWhatsApp.join(", ")}`);
  }
  if (suppressed.length > 0) {
    lines.push("", `Pidieron no recibir mensajes: ${suppressed.join(", ")}`);
  }
  if (unusable.length > 0) lines.push("", `No pude leer su teléfono: ${unusable.join(", ")}`);

  if (lines.length === 1) lines.push("", "No pude agregar a nadie de lo que me mandaste.");

  return lines.join("\n");
}

/** La pregunta por un nombre que la libreta guardó como apodo. */
export const askName = (label: string) =>
  `Una cosa: en tu contacto aparece como «${label}». ¿Cómo se llama, para la lista?`;


/**
 * Lo que quedó a medias con este organizador.
 *
 * Mismo patrón que `guests.pending_question`: el siguiente mensaje de este
 * número se lee como respuesta a esto. Caduca pronto — quince minutos — porque
 * un "Ana" suelto mañana no es la respuesta a una pregunta de ayer.
 */
const PENDING_TTL_MS = 15 * 60 * 1000;

type PendingPayload = {
  eventId: string;
  eventName: string;
  organizerName: string;
  /** Contactos esperando a que nos digan cómo se llaman. */
  queue?: { phone: string; label: string }[];
  /** Contactos esperando a que nos digan a qué evento van. */
  contacts?: SharedContact[];
};

type OrganizerRow = typeof organizers.$inferSelect;

export async function remember(
  organizerId: string,
  action: "contact_event" | "contact_name",
  payload: PendingPayload,
): Promise<void> {
  await db
    .update(organizers)
    .set({
      pendingAction: action,
      pendingActionAt: new Date(),
      pendingPayload: payload,
      updatedAt: new Date(),
    })
    .where(eq(organizers.id, organizerId));
}

export async function forget(organizerId: string): Promise<void> {
  await db
    .update(organizers)
    .set({ pendingAction: null, pendingActionAt: null, pendingPayload: null })
    .where(eq(organizers.id, organizerId));
}

/** El organizador con algo pendiente y todavía vigente, o null. */
export function pendingOf(organizer: OrganizerRow): {
  action: string;
  payload: PendingPayload;
} | null {
  if (!organizer.pendingAction || !organizer.pendingActionAt) return null;
  if (Date.now() - organizer.pendingActionAt.getTime() > PENDING_TTL_MS) return null;
  return {
    action: organizer.pendingAction,
    payload: organizer.pendingPayload as PendingPayload,
  };
}

/**
 * Contesta lo que quedó pendiente, o null si este mensaje no lo contesta.
 *
 * Null es la respuesta común y la importante: deja que el mensaje siga su
 * camino normal en vez de tragárselo.
 */
export async function answerPending(
  organizer: OrganizerRow,
  events_: { organizer: OrganizerRow; event: typeof events.$inferSelect }[],
  text: string | null,
): Promise<string | null> {
  const pending = pendingOf(organizer);
  if (!pending) return null;

  const answer = text?.trim() ?? "";
  if (!answer) return null;

  if (pending.action === "contact_event") {
    const choice = Number.parseInt(answer, 10);
    const chosen = events_[choice - 1];
    if (!chosen) {
      // Ni número ni evento: se suelta el asunto en vez de insistir. Pueden
      // volver a compartir los contactos cuando quieran.
      await forget(organizer.id);
      return null;
    }

    await forget(organizer.id);
    const result = await addAll(
      chosen.event.id,
      chosen.event.name,
      organizer.fullName,
      pending.payload.contacts ?? [],
    );
    return await continueWith(organizer, chosen.event.id, chosen.event.name, result);
  }

  if (pending.action === "contact_name") {
    const queue = pending.payload.queue ?? [];
    const current = queue[0];
    if (!current) {
      await forget(organizer.id);
      return null;
    }

    const name = usableName(answer);
    if (!name) {
      // Contestó algo que tampoco sirve de nombre. Una vez y ya: insistir con
      // el nombre de la suegra de alguien no es persistencia.
      await forget(organizer.id);
      return `Lo dejo pendiente. Puedes agregar a ${current.label} desde la app cuando quieras.`;
    }

    const phone = normalizePhone(current.phone);
    if (phone) {
      const event = await db.query.events.findFirst({
        where: eq(events.id, pending.payload.eventId),
      });
      if (event) {
        await addGuestFromContact(
          event.id,
          event.maxPartySize,
          name,
          phone,
          organizer.fullName,
        );
      }
    }

    const rest = queue.slice(1);
    await forget(organizer.id);

    if (rest.length > 0) {
      await remember(organizer.id, "contact_name", { ...pending.payload, queue: rest });
      return `Listo, ${name} queda en la lista.\n\n${askName(rest[0].label)}`;
    }
    return `Listo, ${name} queda en la lista.`;
  }

  return null;
}

/** Encadena el resumen con la primera pregunta de nombre, si quedó alguna. */
export async function continueWith(
  organizer: OrganizerRow,
  eventId: string,
  eventName: string,
  result: ContactResult,
): Promise<string> {
  if (result.asking.length === 0) return result.text;

  await remember(organizer.id, "contact_name", {
    eventId,
    eventName,
    organizerName: organizer.fullName,
    queue: result.asking,
  });

  return `${result.text}\n\n${askName(result.asking[0].label)}`;
}
