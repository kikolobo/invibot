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
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { events } from "./events";
import { rsvpStatus, inviteStatus, guestEventType, guestEventSource } from "./enums";

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
}));

export const guestEventsRelations = relations(guestEvents, ({ one }) => ({
  guest: one(guests, { fields: [guestEvents.guestId], references: [guests.id] }),
  event: one(events, { fields: [guestEvents.eventId], references: [events.id] }),
}));

export const guestGroupsRelations = relations(guestGroups, ({ one, many }) => ({
  event: one(events, { fields: [guestGroups.eventId], references: [events.id] }),
  guests: many(guests),
}));
