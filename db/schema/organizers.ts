import { pgTable, text, timestamp, boolean, uuid, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { events } from "./events";
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
    index("organizers_phone_idx").on(t.phoneE164),
  ],
);

export const organizersRelations = relations(organizers, ({ one }) => ({
  event: one(events, { fields: [organizers.eventId], references: [events.id] }),
}));
