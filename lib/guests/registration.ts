import { and, desc, eq, inArray, isNotNull, or, sql as raw } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { events, guests, suppressions } from "@/db/schema";
import { normalizePhone, variantsOf } from "@/lib/phone";
import { recordGuestEvent } from "./history";
import { formatEventDate } from "@/lib/events/format";
import {
  parseRegistration,
  looksLikeAName,
  cleanName,
  readYesNo,
} from "./auto-register";
import { splitNames, fullNameOf, type SplitPerson } from "./name-split";

type GuestRow = typeof guests.$inferSelect;
type EventRow = typeof events.$inferSelect;

/**
 * Auto-registro: the conversation rules.
 *
 * Every reply here is a fixed string. No assistant writes a word of this, which
 * is the whole safety property: an unapproved registrant cannot be talked into
 * revealing the venue, because nothing that knows the venue is in the loop.
 *
 * One model call does happen, in `name-split.ts`, and it is a parser: it is
 * handed the name line and nothing else, and returns a structure. What it
 * cannot do is speak — every sentence below is still written here.
 * It also means this path costs nothing per message and can be reasoned about
 * exhaustively — see AUTO-REGISTRO.md for the table these functions implement.
 */

export const COPY = {
  registered: (event: EventRow) =>
    // The date, not the time: "Save the Date" is about the day, and
    // `formatEventWhen` ends in "p.m." — which collided with the full stop and
    // printed "7:00 p.m..".
    `Gracias por tu registro para ${event.name}, el ${formatEventDate(event)}. ¡Save the Date! Pronto te enviaremos tu invitación oficial.`,
  askName: "Disculpa, ¿cuál es tu nombre completo?",
  pending: "Tu registro aún no está procesado. En cuanto lo esté, te enviaremos tu invitación oficial.",
  alreadyConfirmed: "¡Ya estás registrado!",
  awaitingRsvp: "Ya tienes tu invitación. ¿Confirmas tu asistencia?",
  askNameUpdate: "Veo que estás usando otro nombre. ¿Quieres que actualice tu registro con ese nombre?",
  nameUpdated: "Listo, actualicé tu nombre.",
  nameKept: "Perfecto, lo dejamos como está.",
  closed: "El evento ya está cerrado. ¡Gracias!",

  /**
   * Asked once and only once. If they answer with something that is not a
   * name, the registration stands as it is and the host fixes it at approval —
   * pressing twice for a surname is how a registration link stops being easy.
   */
  askFullName: (who: string) => `Gracias 🙌 Disculpa, ¿cuál sería el nombre completo de ${who}?`,
  askBothNames: "Gracias 🙌 ¿Cuáles serían sus nombres completos, para la lista de asistentes?",

  /** They registered two people for an event that seats one. */
  soloEvent:
    "Este evento es individual. Si gustas, contacta al organizador para que envíe una invitación adicional.",

  /** They registered three or more. */
  onlyPlusOne:
    "Este evento sólo permite un acompañante. Si requieres ingresar a más personas o una invitación adicional, contacta al organizador.",
} as const;

/**
 * How long the catch-all stays quiet after we last said something. Long enough
 * that pestering gets one answer rather than five; short enough that someone
 * coming back the next day is not ignored.
 */
const NOTICE_THROTTLE_MS = 2 * 60 * 60 * 1000;

/** A question goes stale: an answer two days later is a new conversation. */
const QUESTION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * What the webhook should do. Sending stays in the route, where the ledger and
 * the sending number already live; deciding stays here.
 */
export type RegistrationAction =
  | { kind: "none" }
  | { kind: "silent" }
  | { kind: "reply"; guestId: string; text: string }
  /** No guest row exists — a closed event never creates one. */
  | { kind: "reply-phone"; text: string };

const nothing: RegistrationAction = { kind: "none" };

/**
 * Runs before `resolveGuest` and before `parseIntent`, and returns `none` when
 * this is an ordinary message so the existing pipeline is untouched.
 *
 * The ordering is the feature. A registration code has to win over guest
 * resolution, or an existing guest registering for a *second* event is filed
 * into the first one's thread. A pending question has to win over intent
 * parsing, or "sí" to "¿actualizo tu nombre?" is recorded as confirming
 * attendance — by someone the host has not approved.
 */
export async function handleAutoRegistro(args: {
  fromPhoneE164: string;
  text: string | null;
  profileName: string | null;
}): Promise<RegistrationAction> {
  const { fromPhoneE164, text, profileName } = args;

  const pending = await guestAwaitingAnswer(fromPhoneE164);
  if (pending) return answerQuestion(pending, text);

  const parsed = parseRegistration(text);
  if (!parsed) return await unapprovedWithoutCode(fromPhoneE164);

  const event = await db.query.events.findFirst({
    where: eq(events.registrationCode, parsed.code),
  });
  // A checksum-valid code for no event we know is not a registration. Falling
  // through leaves the existing behaviour: recorded, unanswered.
  if (!event) return nothing;

  // Looked up before the closed check so that a guest we already know is
  // answered through the ledger rather than as an anonymous number.
  const existing = await guestOnEvent(event.id, fromPhoneE164);

  if (!acceptingRegistrations(event)) {
    if (existing) {
      return existing.approvalStatus === "rejected"
        ? { kind: "silent" }
        : { kind: "reply", guestId: existing.id, text: COPY.closed };
    }
    return (await isSuppressed(fromPhoneE164))
      ? { kind: "silent" }
      : { kind: "reply-phone", text: COPY.closed };
  }

  if (existing) return await existingGuest(existing, event, parsed.name);

  return register(event, fromPhoneE164, parsed.name, cleanName(profileName ?? ""));
}

/**
 * Anything else an unapproved person sends.
 *
 * Without this they fell straight through to the ordinary pipeline and the
 * assistant answered them — the send was refused downstream, so nothing leaked,
 * but they got silence where the rules promise "tu registro aún no está
 * procesado", and we paid for a model run to produce a message nobody could
 * receive.
 *
 * Only when they are unapproved *everywhere*. Someone who is a real guest at
 * one event and pending at another is still a real guest, and their questions
 * belong to the assistant.
 */
async function unapprovedWithoutCode(phoneE164: string): Promise<RegistrationAction> {
  const rows = await db.select().from(guests).where(phoneMatches(phoneE164));
  if (rows.length === 0) return nothing;
  if (rows.some((row) => row.approvalStatus === "approved")) return nothing;

  if (rows.every((row) => row.approvalStatus === "rejected")) return { kind: "silent" };

  const pending = rows.find((row) => row.approvalStatus === "pending")!;
  return await noticeOnce(pending, COPY.pending);
}

/** Gate 1. "Off" and "closed" are the same thing to a guest, so one check. */
function acceptingRegistrations(event: EventRow): boolean {
  if (!event.autoRegisterEnabled) return false;
  if (event.archivedAt) return false;
  if (event.status === "closed" || event.status === "cancelled") return false;
  // The date is the backstop, not the switch: a host may close registration a
  // week early, but nobody registers for a party that already happened.
  const over = event.endsAt ?? event.startsAt;
  return over.getTime() > Date.now();
}

/** Gate 2. */
async function existingGuest(
  guest: GuestRow,
  event: EventRow,
  name: string | null,
): Promise<RegistrationAction> {
  if (guest.approvalStatus === "rejected") return { kind: "silent" };

  if (guest.approvalStatus === "approved") {
    return {
      kind: "reply",
      guestId: guest.id,
      text: guest.rsvpStatus === "confirmed" ? COPY.alreadyConfirmed : COPY.awaitingRsvp,
    };
  }

  // Pending, and they told us a name. If all we hold is their WhatsApp handle,
  // take theirs — there is nothing to ask about, we were only ever guessing.
  // If they gave us a name before and are now giving a different one, that is a
  // correction and worth confirming before overwriting what the host may have
  // already tidied up.
  if (name && name.toLowerCase() !== guest.fullName.toLowerCase()) {
    if (!guest.nameFromGuest) return await adoptName(guest, event, name);
    return await askNameUpdate(guest, name);
  }
  return await noticeOnce(guest, COPY.pending);
}

/**
 * What a registration line means, once two people can arrive on one.
 *
 * `note` and the third person onwards are the host's problem, not a reason to
 * refuse anybody: they are kept in the guest's notes and the guest is told
 * plainly what the invitation actually seats.
 */
type Registered = {
  fullName: string;
  companions: string[];
  /** Appended to the reply, after the Save the Date. */
  notice: string | null;
  /** Whose full name is still missing, for the single question we may ask. */
  missing: "first" | "second" | "both" | null;
  /** First names, so the question can use them. */
  who: string[];
  notes: string | null;
};

async function readRegistration(
  given: string,
  maxPartySize: number,
): Promise<Registered | null> {
  const split = await splitNames(given);
  if (!split.ok) return null;

  const people = split.names.people;
  if (people.length === 0) return null;

  // One person and a note — "Ana y familia", "Ana +1". The companion has no
  // name, but the guest's own name is "Ana" and not the whole line.
  if (people.length === 1) {
    if (!split.names.note) return null;
    return {
      fullName: fullNameOf(people[0]),
      companions: [],
      notice: null,
      missing: null,
      who: [people[0].first],
      notes: `Escribió: «${given}»`,
    };
  }

  const seats = Math.max(1, maxPartySize);
  const kept = people.slice(0, seats);
  const spare = people.slice(seats);

  const notes = [
    split.names.note ? `Escribió: «${given}»` : null,
    spare.length > 0 ? `También mencionó: ${spare.map(fullNameOf).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(". ") || null;

  const notice =
    seats < 2 ? COPY.soloEvent : spare.length > 0 ? COPY.onlyPlusOne : null;

  const missingFor = (person: SplitPerson | undefined) => Boolean(person && !person.last);
  const missing =
    kept.length < 2
      ? null
      : missingFor(kept[0]) && missingFor(kept[1])
        ? "both"
        : missingFor(kept[0])
          ? "first"
          : missingFor(kept[1])
            ? "second"
            : null;

  return {
    fullName: fullNameOf(kept[0]),
    companions: kept.slice(1).map(fullNameOf),
    notice,
    missing,
    who: kept.map((person) => person.first),
    notes,
  };
}

/** The one question we may ask about a pair of names, or nothing. */
function questionFor(registered: Registered): { text: string; value: string } | null {
  if (!registered.missing) return null;
  if (registered.missing === "both") {
    return { text: COPY.askBothNames, value: "both" };
  }
  const who = registered.missing === "first" ? registered.who[0] : registered.who[1];
  return { text: COPY.askFullName(who), value: registered.missing };
}

/** Gate 3. */
async function register(
  event: EventRow,
  phoneE164: string,
  /** What they typed after "mi nombre es:". Null when they left it blank. */
  given: string | null,
  /** Their WhatsApp profile name — a handle, and only ever a placeholder. */
  handle: string | null,
): Promise<RegistrationAction> {
  const name = given;

  // Two people on one line — "Laura y Pedro Bap". Read before anything is
  // written, because it decides the name, the companion and the reply at once.
  const pair = given ? await readRegistration(given, event.maxPartySize) : null;
  const question = pair ? questionFor(pair) : null;

  const fullName = pair?.fullName ?? given ?? handle ?? "Sin nombre";

  // Meta hands us the wa_id, which for Mexico is the legacy `+521…` form. Every
  // other phone in this database is canonical, and Meta itself rejects a send
  // addressed to the 521 form — so a guest stored as the webhook spelled them
  // could never be written to.
  const normalized = normalizePhone(phoneE164);

  const [guest] = await db
    .insert(guests)
    .values({
      eventId: event.id,
      fullName,
      firstName: name ? fullName.split(/\s+/)[0] : null,
      phoneE164: normalized?.e164 ?? phoneE164,
      phoneVariants: normalized?.variants ?? variantsOf(phoneE164),
      partySizeAllowed: event.maxPartySize,
      companions: pair?.companions ?? [],
      notes: pair?.notes ?? null,
      accessToken: nanoid(24),
      approvalStatus: "pending",
      source: "self",
      // Only what they typed counts as theirs. A WhatsApp handle standing in
      // for a name is a guess, and saying otherwise here is what stops us ever
      // replacing it.
      nameFromGuest: given !== null,
      // Asked for now, answered next message. Written in the same statement as
      // the guest so a crash between the two cannot leave a guest nobody asked.
      pendingQuestion: name ? (question ? "full_names" : null) : "name",
      pendingQuestionAt: name && !question ? null : new Date(),
      pendingQuestionValue: question?.value ?? null,
      registrationNoticeAt: new Date(),
    })
    .returning();

  // The host's view of this guest should start with how they got here, not
  // with an invitation appearing out of nowhere.
  await recordGuestEvent({
    guestId: guest.id,
    eventId: event.id,
    type: "self_registered",
    source: "guest",
    at: new Date(),
  });

  if (!name) return { kind: "reply", guestId: guest.id, text: COPY.askName };

  // One message, not three: the Save the Date, then what the invitation seats,
  // then the single question. Each of those as its own message is a phone
  // buzzing four times for one registration.
  const text = [COPY.registered(event), pair?.notice, question?.text]
    .filter(Boolean)
    .join("\n\n");

  return { kind: "reply", guestId: guest.id, text };
}

/** Gate 4. */
async function answerQuestion(
  guest: GuestRow,
  text: string | null,
): Promise<RegistrationAction> {
  // The surname (or the pair of them) we asked for once. Whatever comes back,
  // the question is closed: asking twice is the loop this file exists to avoid.
  if (guest.pendingQuestion === "full_names") {
    return await answerFullNames(guest, text);
  }

  if (guest.pendingQuestion === "name_update") {
    const answer = readYesNo(text);
    // The name is the one we quoted in the question, not the word they replied
    // with. Reading it off the reply renamed people to "sí".
    await clearQuestion(guest.id, answer === "yes" ? guest.pendingQuestionValue : null);

    if (answer === "yes") return { kind: "reply", guestId: guest.id, text: COPY.nameUpdated };
    if (answer === "no") return { kind: "reply", guestId: guest.id, text: COPY.nameKept };
    return await noticeOnce(guest, COPY.pending);
  }

  // Asking for the name. Someone who answers by re-sending the whole
  // registration message — which is what the link produces, so it is the
  // obvious thing to do — is answering, not ignoring us: take the name out of
  // it rather than asking a second time.
  const resent = parseRegistration(text)?.name ?? null;
  const answer = resent ?? (looksLikeAName(text) ? cleanName(text ?? "") : null);

  if (answer) {
    const name = answer;
    await db
      .update(guests)
      .set({
        fullName: name,
        firstName: name.split(/\s+/)[0],
        nameFromGuest: true,
        pendingQuestion: null,
        pendingQuestionAt: null,
        pendingQuestionValue: null,
        registrationNoticeAt: new Date(),
      })
      .where(eq(guests.id, guest.id));

    const event = await db.query.events.findFirst({ where: eq(events.id, guest.eventId) });
    return event
      ? { kind: "reply", guestId: guest.id, text: COPY.registered(event) }
      : { kind: "silent" };
  }

  // They asked something instead of answering. One more try, then stop —
  // repeating a question someone is plainly not going to answer is not
  // persistence, it is a loop.
  if (!guest.registrationNoticeAt || askedOnlyOnce(guest)) {
    await db
      .update(guests)
      .set({ pendingQuestionAt: new Date(), registrationNoticeAt: new Date() })
      .where(eq(guests.id, guest.id));
    return { kind: "reply", guestId: guest.id, text: COPY.askName };
  }

  await clearQuestion(guest.id, null);
  return await noticeOnce(guest, COPY.pending);
}

/**
 * They answered the one question about the two names, or they did not.
 *
 * Either way it ends here. A usable answer replaces the names; anything else
 * leaves the registration exactly as it already was, which is a complete
 * registration with a first name missing a surname — the host sees both names
 * in the approval queue and can type it themselves.
 */
async function answerFullNames(
  guest: GuestRow,
  text: string | null,
): Promise<RegistrationAction> {
  const missing = guest.pendingQuestionValue;
  const answer = text?.trim() ?? "";

  const clear = {
    pendingQuestion: null,
    pendingQuestionAt: null,
    pendingQuestionValue: null,
    registrationNoticeAt: new Date(),
  } as const;

  const companion = guest.companions[0] ?? null;
  let fullName = guest.fullName;
  let companions = guest.companions;
  let understood = false;

  // "Cuáles serían sus nombres completos" is answered with two names again, so
  // it goes back through the same splitter.
  if (missing === "both") {
    const split = await splitNames(answer);
    if (split.ok && split.names.people.length >= 2) {
      fullName = fullNameOf(split.names.people[0]);
      companions = [fullNameOf(split.names.people[1])];
      understood = true;
    }
  } else if (looksLikeAName(answer)) {
    // One name was asked for, so the answer is that name — but an answer that
    // is only a surname ("Cantú", "de Hoyos") completes the name we already
    // have instead of replacing it. Decided by whether the given name they
    // already told us appears in the answer, not by counting words: "de Hoyos"
    // is two words and still no first name.
    const given = cleanName(answer)!;
    const current = missing === "second" ? (companion ?? "") : guest.fullName;
    const knownFirst = current.split(/\s+/)[0] ?? "";
    const fold = (text: string) =>
      text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const namesThem = given
      .split(/\s+/)
      .some((word) => fold(word) === fold(knownFirst));

    const whole = namesThem || !knownFirst ? given : `${knownFirst} ${given}`;
    const tidy = cleanName(whole) ?? given;

    if (missing === "second" && companion) companions = [tidy];
    else fullName = tidy;
    understood = true;
  }

  await db
    .update(guests)
    .set({
      ...clear,
      ...(understood
        ? { fullName, firstName: fullName.split(/\s+/)[0], companions, nameFromGuest: true }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(guests.id, guest.id));

  // Nothing is said back on a failed answer. They already have their Save the
  // Date; "no entendí" to someone who just wrote their friend's name is a
  // worse message than silence.
  if (!understood) return { kind: "silent" };

  const both = [fullName, ...companions].filter(Boolean).join(" y ");
  return { kind: "reply", guestId: guest.id, text: `Listo, quedan registrados ${both} 🙌` };
}

/**
 * Gate 5. The catch-all, but only if we have not just spoken — see
 * `registrationNoticeAt`.
 */
async function noticeOnce(guest: GuestRow, text: string): Promise<RegistrationAction> {
  const last = guest.registrationNoticeAt?.getTime() ?? 0;
  if (Date.now() - last < NOTICE_THROTTLE_MS) return { kind: "silent" };
  // Awaited, not fired and forgotten: the response ends this invocation, and a
  // throttle that did not get written is a throttle that does not exist.
  await db
    .update(guests)
    .set({ registrationNoticeAt: new Date() })
    .where(eq(guests.id, guest.id));
  return { kind: "reply", guestId: guest.id, text };
}

/**
 * Replacing a placeholder with the real thing, and acknowledging the
 * registration in the same breath: this is the first moment we know who they
 * are, so it is the first moment the Save the Date is honest.
 */
async function adoptName(
  guest: GuestRow,
  event: EventRow,
  name: string,
): Promise<RegistrationAction> {
  await db
    .update(guests)
    .set({
      fullName: name,
      firstName: name.split(/\s+/)[0],
      nameFromGuest: true,
      pendingQuestion: null,
      pendingQuestionAt: null,
      pendingQuestionValue: null,
      registrationNoticeAt: new Date(),
    })
    .where(eq(guests.id, guest.id));

  return { kind: "reply", guestId: guest.id, text: COPY.registered(event) };
}

async function askNameUpdate(guest: GuestRow, name: string): Promise<RegistrationAction> {
  await db
    .update(guests)
    .set({
      pendingQuestion: "name_update",
      pendingQuestionAt: new Date(),
      pendingQuestionValue: name,
      registrationNoticeAt: new Date(),
    })
    .where(eq(guests.id, guest.id));
  return { kind: "reply", guestId: guest.id, text: COPY.askNameUpdate };
}

const askedOnlyOnce = (guest: GuestRow) =>
  guest.pendingQuestionAt != null &&
  Date.now() - guest.pendingQuestionAt.getTime() < NOTICE_THROTTLE_MS;

async function clearQuestion(guestId: string, name: string | null): Promise<void> {
  await db
    .update(guests)
    .set({
      pendingQuestion: null,
      pendingQuestionAt: null,
      pendingQuestionValue: null,
      registrationNoticeAt: new Date(),
      ...(name ? { fullName: name, firstName: name.split(/\s+/)[0] } : {}),
    })
    .where(eq(guests.id, guestId));
}

/** Every phone shape Meta might use, matched the way `resolveGuest` matches. */
function phoneMatches(phoneE164: string) {
  const candidates = variantsOf(phoneE164);
  return or(
    inArray(guests.phoneE164, candidates),
    ...candidates.map(
      (candidate) => raw`${guests.phoneVariants} @> ${JSON.stringify([candidate])}::jsonb`,
    ),
  );
}

async function guestOnEvent(eventId: string, phoneE164: string): Promise<GuestRow | null> {
  const [match] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.eventId, eventId), phoneMatches(phoneE164)))
    .limit(1);
  return match ?? null;
}

/**
 * The guest, on any event, that we last asked something and is still waiting.
 *
 * Across events on purpose: the question was asked of a phone number, and the
 * person answering has no idea they are in a per-event table. Most recent wins,
 * which is the only reading that makes sense of two open questions at once.
 */
async function guestAwaitingAnswer(phoneE164: string): Promise<GuestRow | null> {
  const [match] = await db
    .select()
    .from(guests)
    .where(and(isNotNull(guests.pendingQuestion), phoneMatches(phoneE164)))
    .orderBy(desc(guests.pendingQuestionAt))
    .limit(1);

  if (!match?.pendingQuestionAt) return null;
  if (Date.now() - match.pendingQuestionAt.getTime() > QUESTION_TTL_MS) {
    await clearQuestion(match.id, null);
    return null;
  }
  return match;
}

async function isSuppressed(phoneE164: string): Promise<boolean> {
  const row = await db.query.suppressions.findFirst({
    where: inArray(suppressions.phoneE164, variantsOf(phoneE164)),
  });
  return Boolean(row);
}
