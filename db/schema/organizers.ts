import { pgTable, text, timestamp, boolean, uuid, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { events } from "./events";
import { users } from "./auth";
import { organizerRole } from "./enums";

/**
 * The people running an event, as phone numbers rather than accounts.
 *
 * Deliberately not `users`. An organizador is a wedding planner, a sister, a
 * venue coordinator — someone who will answer a WhatsApp message and will never
 * log in. Making them an account would mean an invitation, a password and a
 * seat, to do something a text message already does.
 *
 * Per event, not per organization: the same planner runs different weddings
 * with different people, and "who is answering questions" is a fact about one
 * party rather than about a company.
 */
export const organizers = pgTable(
  "organizers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    fullName: text("full_name").notNull(),
    phoneE164: text("phone_e164").notNull(),
    /** Every shape Meta might send, matched the way guests are. */
    phoneVariants: jsonb("phone_variants").$type<string[]>().notNull().default([]),

    role: organizerRole("role").notNull().default("organizer"),

    /**
     * The account behind this row, when somebody was invited into the app
     * rather than only listed by phone. Null for WhatsApp-only organizadores
     * and for the owner, whose access comes from owning the event.
     */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),

    /**
     * Who receives a guest's escalated question on WhatsApp.
     *
     * Exactly one per event, enforced below. Every organizador can ask us
     * things; only this one is asked things, so a guest's question cannot land
     * on three phones and come back with three different answers.
     *
     * Never zero: the first organizador added takes it, and marking somebody
     * else moves it rather than clearing it.
     */
    isResponder: boolean("is_responder").notNull().default(false),

    /**
     * The account owner, on every event they run.
     *
     * Added for them rather than by them — they are the one person certain to
     * be organizing — and never removable, so the fallback when a responder is
     * deleted always has somewhere to land. Copied from `users.phone` when
     * created; edits to this row write back to the account.
     */
    isOwner: boolean("is_owner").notNull().default(false),

    /**
     * The last time they wrote to us, which is what opens the 24-hour window.
     *
     * Tracked here rather than in `conversations`, which is keyed to a guest.
     * Without it every escalation would pay for a template even when a free
     * reply was legal — an organizador mid-conversation is the common case, not
     * the exception.
     */
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),

    /**
     * Lo que le preguntamos y estamos esperando que conteste.
     *
     * Mismo truco que `guests.pending_question`, y por la misma razón: el
     * siguiente mensaje de este número se lee como respuesta a esto y no como
     * un mensaje suelto. Hoy sólo lo usa el alta por contacto compartido — a
     * qué evento va, o cómo se llama de verdad alguien que en la libreta está
     * como "Mamá".
     */
    pendingAction: text("pending_action"),
    pendingActionAt: timestamp("pending_action_at", { withTimezone: true }),
    /** Los contactos a medio procesar, con lo que ya se decidió de cada uno. */
    pendingPayload: jsonb("pending_payload"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One person, one entry. Adding the same phone twice is a typo, not a wish.
    uniqueIndex("organizers_event_phone_key").on(t.eventId, t.phoneE164),
    // At most one responder per event, enforced by the database rather than by
    // remembering to clear the old one.
    uniqueIndex("organizers_responder_key")
      .on(t.eventId)
      .where(sql`${t.isResponder}`),
    uniqueIndex("organizers_owner_key")
      .on(t.eventId)
      .where(sql`${t.isOwner}`),
    // One account, one seat per event.
    uniqueIndex("organizers_event_user_key")
      .on(t.eventId, t.userId)
      .where(sql`${t.userId} is not null`),
    index("organizers_user_idx").on(t.userId),
    index("organizers_phone_idx").on(t.phoneE164),
  ],
);

export const organizersRelations = relations(organizers, ({ one }) => ({
  event: one(events, { fields: [organizers.eventId], references: [events.id] }),
}));

/**
 * Somebody invited to help run an event who does not have an account yet.
 *
 * Addressed by WhatsApp number, because that is where the invitation goes and
 * what their account will carry once they sign up. The row lives only until it
 * is used or revoked: accepting turns it into an `organizers` row and deletes
 * it, so a pending invitation is exactly a row here.
 *
 * The token is the link. It lets the person past the signup passcode, and
 * only for an account with this same number.
 */
export const organizerInvites = pgTable(
  "organizer_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    phoneE164: text("phone_e164").notNull(),
    role: organizerRole("role").notNull(),
    token: text("token").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** When the WhatsApp went out, or null if it could not be sent. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("organizer_invites_token_key").on(t.token),
    // Inviting the same number twice updates the invitation instead.
    uniqueIndex("organizer_invites_event_phone_key").on(t.eventId, t.phoneE164),
    index("organizer_invites_phone_idx").on(t.phoneE164),
  ],
);

export const organizerInvitesRelations = relations(organizerInvites, ({ one }) => ({
  event: one(events, { fields: [organizerInvites.eventId], references: [events.id] }),
}));
