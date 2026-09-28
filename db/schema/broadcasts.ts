import { pgTable, text, timestamp, boolean, jsonb, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { events } from "./events";
import { guests } from "./guests";
import { sends } from "./messaging";
import type {
  Audience,
  BroadcastStatus,
  ExclusionReason,
  RecipientRoute,
  RecipientStatus,
} from "@/lib/broadcasts/labels";

/**
 * "Mensajes": what an organizer says to their guests beyond the invitation.
 *
 * The audience is stored as the choice ("confirmados", these groups) rather
 * than as a list, because a scheduled message resolves it when it goes out —
 * someone who confirms the day before a message to "sin responder" should not
 * get it. The list of who it actually reached is `broadcast_recipients`,
 * written at that moment.
 */
export const broadcasts = pgTable(
  "broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    /** Bold at the top of the message, and the only part the template carries. */
    title: text("title").notNull(),
    body: text("body").notNull(),
    audience: jsonb("audience").$type<Audience>().notNull(),

    status: text("status").$type<BroadcastStatus>().notNull(),
    /** Null means "now". Otherwise the daily cron's run it waits for. */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),

    /**
     * A "mándame una prueba". Kept as a row only so the tester's tap on
     * [Leer mensaje] can find the text; never listed, never counted.
     */
    isTest: boolean("is_test").notNull().default(false),
    testPhoneE164: text("test_phone_e164"),

    /** Who in the audience it skipped, and why, counted when it went out. */
    excluded: jsonb("excluded").$type<Partial<Record<ExclusionReason, number>>>().notNull().default({}),

    createdByUserId: text("created_by_user_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /**
     * Retired messages stay listed, with their numbers, but nobody is sent
     * the text any more and the assistant stops knowing it.
     */
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    retiredByUserId: text("retired_by_user_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("broadcasts_event_idx").on(t.eventId, t.createdAt),
    index("broadcasts_due_idx").on(t.status, t.scheduledFor),
  ],
);

/**
 * Who one message reached, and how.
 *
 * `sendId` is the first thing that went out: the whole message when their
 * window was open, the template otherwise. `fullSendId` and `openedAt` are
 * set when a template recipient asks for the rest — which is the number an
 * organizer actually wants, since a read template only means they saw the
 * title.
 */
export const broadcastRecipients = pgTable(
  "broadcast_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    broadcastId: uuid("broadcast_id")
      .notNull()
      .references(() => broadcasts.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),

    route: text("route").$type<RecipientRoute>().notNull(),
    status: text("status").$type<RecipientStatus>().notNull(),
    error: text("error"),

    sendId: uuid("send_id").references(() => sends.id, { onDelete: "set null" }),
    fullSendId: uuid("full_send_id").references(() => sends.id, { onDelete: "set null" }),
    openedAt: timestamp("opened_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One copy per person per message, which is also what makes a sweep that
    // runs twice harmless: the second one finds them already written.
    uniqueIndex("broadcast_recipients_key").on(t.broadcastId, t.guestId),
    index("broadcast_recipients_guest_idx").on(t.guestId),
  ],
);
