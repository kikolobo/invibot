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
} from "drizzle-orm/pg-core";
import { events } from "./events";
import { rsvpStatus, inviteStatus } from "./enums";

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
