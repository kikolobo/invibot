import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  uniqueIndex,
  index,
  check,
  integer as int,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { events } from "./events";
import {
  rsvpStatus,
  inviteStatus,
  approvalStatus,
  guestSource,
  pendingQuestion,
  guestEventType,
  guestEventSource,
  passStatus,
} from "./enums";

/**
 * The controlled vocabulary of groups for one event. `normalizedName` is the
 * uniqueness key, so "Familia de la novia" and "familia novia" resolve to the
 * same row instead of fragmenting the list.
 */
export const guestGroups = pgTable(
  "guest_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_groups_event_normalized_key").on(t.eventId, t.normalizedName),
    index("guest_groups_event_idx").on(t.eventId),
  ],
);

export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    fullName: text("full_name").notNull(),
    /** Used for greetings — "Querida María" reads better than the full legal name. */
    firstName: text("first_name"),

    /**
     * Canonical E.164, normalised through libphonenumber-js with MX as default region.
     * Mexican mobiles historically carried an extra `1` after +52 on WhatsApp and Meta
     * is inconsistent about which form it echoes back, so inbound matching goes through
     * `phoneVariants` — never match on `phoneE164` alone or replies land in the void.
     */
    phoneE164: text("phone_e164"),
    phoneVariants: jsonb("phone_variants").$type<string[]>().notNull().default([]),
    email: text("email"),
    locale: text("locale"),

    /** Which group this guest belongs to, from the event's own vocabulary. */
    groupId: uuid("group_id").references(() => guestGroups.id, { onDelete: "set null" }),

    inviteStatus: inviteStatus("invite_status").notNull().default("pending"),
    rsvpStatus: rsvpStatus("rsvp_status").notNull().default("no_response"),
    rsvpRespondedAt: timestamp("rsvp_responded_at", { withTimezone: true }),

    partySizeAllowed: integer("party_size_allowed").notNull().default(1),
    partySizeConfirmed: integer("party_size_confirmed"),
    /**
     * Who they are bringing, by name. Empty when nobody, or when nobody has
     * said yet — a guest with a seat for two and no name here is still coming
     * with someone.
     *
     * An array rather than a column because the seat count is a per-event rule
     * and only happens to be two today; the first entry is the +1. The name
     * matters at the door, where "Acompañante de Ana" tells the person holding
     * the list nothing they can check.
     */
    companions: jsonb("companions").$type<string[]>().notNull().default([]),

    dietary: text("dietary"),
    accessibility: text("accessibility"),
    /** Organizer-only notes. Never shown to the guest, never quoted by the agent. */
    notes: text("notes"),

    /**
     * Organizer-only. Printed as a bare "V" on the door list rather than "VIP",
     * so a guest reading over someone's shoulder cannot tell what it stands
     * for — a list that quietly ranks the people on it is worse than no mark.
     */
    isVip: boolean("is_vip").notNull().default(false),

    /**
     * Table assignment. Text rather than an integer: table "07" and table "7"
     * are the same table to a database and different signs on a floor plan, and
     * whoever printed the cards decides which. Five characters, digits only.
     */
    tableNumber: text("table_number"),

    /** Signed token for the microsite. No guest accounts, no passwords, no login. */
    accessToken: text("access_token").notNull(),

    /**
     * Whether the host has let this guest in. See the enum for why this is not
     * folded into `inviteStatus`.
     *
     * A `pending` guest is invisible to everything that sends: no invitation,
     * no assistant, no RSVP. `rejected` is answered with silence rather than a
     * refusal — there is no version of "no" worth putting on someone's phone.
     */
    approvalStatus: approvalStatus("approval_status").notNull().default("approved"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** How they got here. `self` means they used the auto-registro link. */
    source: guestSource("source").notNull().default("manual"),
    /**
     * Whether this name came from the person themselves.
     *
     * False when we fell back to their WhatsApp profile name, which is a handle
     * — "FL", "Kiko 🎧", "Mamá" — and not what they would put on a guest list.
     * A provisional name is replaced the moment they tell us a real one; a name
     * they actually gave is never overwritten without asking.
     */
    nameFromGuest: boolean("name_from_guest").notNull().default(true),

    /**
     * A question we asked them while unapproved, and are waiting on.
     *
     * Read before `parseIntent`, never after: "sí" means yes to whatever we
     * asked, and only means "I am coming" when we asked nothing. Stale ones
     * expire — someone who answers a name question two days later is starting
     * a new conversation, not finishing an old one.
     */
    pendingQuestion: pendingQuestion("pending_question"),
    pendingQuestionAt: timestamp("pending_question_at", { withTimezone: true }),
    /**
     * What the question is about — the name they proposed, for "¿actualizo tu
     * nombre?".
     *
     * A column because the answer arrives in a different request, and the
     * answer itself does not carry it: someone replying "sí" is agreeing to
     * the name we quoted, not telling us they are called "sí". Which is
     * precisely what the first version stored.
     */
    pendingQuestionValue: text("pending_question_value"),
    /**
     * The last time we said anything to them about their registration.
     *
     * One timestamp serving two rules that turn out to be the same rule:
     * do not repeat "tu registro aún no está procesado" to someone pestering
     * us, and do not send it at all to someone whose "gracias" arrives a minute
     * after the Save the Date. In both cases they were told recently and
     * saying it again only makes us look broken.
     */
    registrationNoticeAt: timestamp("registration_notice_at", { withTimezone: true }),

    /**
     * When this guest's QR passes may go out.
     *
     * Set instead of sending, so the pass follows the invitation card by a
     * while rather than piling on top of it — the card is the message they were
     * waiting for and a QR landing in the same breath buries it. Null means
     * nothing is waiting: either they have their passes or they are not owed
     * any.
     *
     * Deliberately well inside the 24-hour window their own confirmation
     * opened. A pass is a free-form image; miss that window and there is no
     * template that can carry one.
     */
    passesDueAt: timestamp("passes_due_at", { withTimezone: true }),

    /**
     * When the day-before message went out — the `acceso_evento` template, or
     * its free-form twin when their window was still open.
     *
     * Its own column rather than inferred from `sends`, because the sweep has to
     * be safe to run twice: the cron can be retried or triggered by hand, and a
     * paid template twice is a second "¡Es mañana!" on somebody's phone.
     */
    passesRemindedAt: timestamp("passes_reminded_at", { withTimezone: true }),


    /**
     * When the one free-form nudge to answer the invitation went out.
     *
     * Only ever set once. A guest who registered themselves opened a 24-hour
     * window by doing so, and this is the reminder that fits inside it without
     * a template — see `lib/guests/rsvp-reminder.ts`. Null means it has not
     * been sent; it is never cleared, because a second nudge is nagging.
     */
    rsvpReminderSentAt: timestamp("rsvp_reminder_sent_at", { withTimezone: true }),

    optedOut: boolean("opted_out").notNull().default(false),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Default NULLS DISTINCT: unique among real phone numbers, unlimited email-only guests.
    uniqueIndex("guests_event_phone_key").on(t.eventId, t.phoneE164),
    uniqueIndex("guests_access_token_key").on(t.accessToken),
    // Enforced here as well as in the action: a form is one way in, and the
    // column should not depend on every future caller remembering the rule.
    check(
      "guests_table_number_format",
      sql`${t.tableNumber} IS NULL OR ${t.tableNumber} ~ '^[1-9][0-9]{0,4}$'`,
    ),
    index("guests_event_idx").on(t.eventId),
    index("guests_rsvp_idx").on(t.eventId, t.rsvpStatus),
  ],
);

/**
 * Global, cross-event opt-out list. A person who says BAJA once is never messaged again
 * by any organizer on the platform. This is a legal requirement under LFPDPPP, not a
 * courtesy — check it before every single send.
 */
export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneE164: text("phone_e164"),
    email: text("email"),
    reason: text("reason").$type<"opt_out" | "complaint" | "hard_bounce" | "manual">().notNull(),
    /** Where the opt-out came from, for audit. */
    sourceEventId: uuid("source_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A row suppresses a phone or an email, not both — so each index must ignore NULLs.
    uniqueIndex("suppressions_phone_key").on(t.phoneE164),
    uniqueIndex("suppressions_email_key").on(t.email),
  ],
);

/**
 * Everything that has happened to a guest, append-only.
 *
 * `guests` holds the current answer; this holds how it was arrived at. A person
 * who confirms, cancels two weeks later, then asks to come after all is three
 * rows here and one row there, and only the three can answer "when did they
 * change their mind" or "how long did the list take to settle".
 *
 * Nothing reads it yet. It is written now because the moment a guest decides
 * something is the one moment it can be recorded — a history cannot be
 * backfilled once it has been overwritten.
 */
export const guestEvents = pgTable(
  "guest_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),

    type: guestEventType("type").notNull(),
    /**
     * When it actually happened, not when we wrote it down: WhatsApp gives a
     * timestamp for every delivery and read, and a webhook can arrive late or
     * be replayed.
     */
    at: timestamp("at", { withTimezone: true }).notNull(),
    /** Who caused it: the guest, the organizer, or the system. */
    source: guestEventSource("source").notNull(),
    /** Seats, the wording that triggered it, an error code — whatever is worth keeping. */
    detail: jsonb("detail").notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("guest_events_guest_idx").on(t.guestId, t.at),
    index("guest_events_event_type_idx").on(t.eventId, t.type),
  ],
);

/**
 * Declared so a guest's history loads with the guest:
 *
 *   db.query.guests.findFirst({ where: ..., with: { history: true } })
 *
 * The alternative — a second query keyed by id everywhere it is needed — is how
 * a log ends up unused. Drizzle picks these up from the schema the client is
 * built with, so no call site has to know about the join.
 */
export const guestsRelations = relations(guests, ({ one, many }) => ({
  event: one(events, { fields: [guests.eventId], references: [events.id] }),
  group: one(guestGroups, { fields: [guests.groupId], references: [guestGroups.id] }),
  history: many(guestEvents),
  passes: many(guestPasses),
}));

export const guestEventsRelations = relations(guestEvents, ({ one }) => ({
  guest: one(guests, { fields: [guestEvents.guestId], references: [guests.id] }),
  event: one(events, { fields: [guestEvents.eventId], references: [events.id] }),
}));

export const guestGroupsRelations = relations(guestGroups, ({ one, many }) => ({
  event: one(events, { fields: [guestGroups.eventId], references: [events.id] }),
  guests: many(guests),
}));

/**
 * One QR per person through the door.
 *
 * A guest bringing someone gets two, because two people arrive and only one of
 * them is holding the phone the invitation went to.
 *
 * Passes are never reactivated. Cancelling revokes them and confirming again
 * mints new codes, so a screenshot taken before someone cancelled is worthless
 * afterwards — which is the only property that makes a pass mean anything.
 */
export const guestPasses = pgTable(
  "guest_passes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),

    /** What the QR encodes. Opaque and unguessable; never an id. */
    code: text("code").notNull(),
    /** 1 for the guest, 2 for their companion. */
    seat: int("seat").notNull().default(1),
    /** The name printed under the code — "Ana" or "Acompañante de Ana". */
    label: text("label").notNull(),

    status: passStatus("status").notNull().default("active"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Set once the image has reached the guest, so a resend is not a double send. */
    sentAt: timestamp("sent_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_passes_code_key").on(t.code),
    index("guest_passes_guest_idx").on(t.guestId, t.status),
    index("guest_passes_event_idx").on(t.eventId, t.status),
  ],
);

export const guestPassesRelations = relations(guestPasses, ({ one }) => ({
  guest: one(guests, { fields: [guestPasses.guestId], references: [guests.id] }),
  event: one(events, { fields: [guestPasses.eventId], references: [events.id] }),
}));
