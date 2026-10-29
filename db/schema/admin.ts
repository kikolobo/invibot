import { pgTable, text, timestamp, uuid, jsonb, index, uniqueIndex, boolean, integer } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { events } from "./events";
import { guests } from "./guests";

/**
 * Everything staff do to an account, in order.
 *
 * The target is a plain id and a copy of the email rather than a foreign key:
 * a purge deletes the user, and the line saying who purged them is exactly
 * the one that has to survive it.
 */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    targetUserId: text("target_user_id"),
    targetEmail: text("target_email"),
    action: text("action").notNull(),
    /** What changed, as before/after or whatever the action needs to explain itself. */
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("admin_audit_target_idx").on(t.targetUserId, t.createdAt),
    index("admin_audit_created_idx").on(t.createdAt),
  ],
);

/**
 * Every sign-in, kept after the session is gone.
 *
 * `sessions` cannot answer "when did this person last get in": signing out
 * deletes the row, and so does expiry. This is the history the admin's
 * activity view reads; nothing else depends on it.
 */
export const signIns = pgTable(
  "sign_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** The admin behind it, when this was "ver como" rather than the person. */
    impersonatedBy: text("impersonated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sign_ins_user_idx").on(t.userId, t.createdAt)],
);

/**
 * Site-wide switches, one row (`id = 'site'`). Read on every signup and every
 * organizer request, so it stays small and flat.
 *
 * The passcode is stored as typed. It is a shared door code that staff hand
 * out and need to read back, not anybody's password; changing it is what
 * revokes it, and doing so also voids every unlock cookie minted for the old
 * one.
 */
export const siteSettings = pgTable("site_settings", {
  id: text("id").primaryKey().default("site"),
  /**
   * - `passcode` — anyone with the code, or an organizer invitation.
   * - `open`     — anyone at all.
   * - `closed`   — invitations and staff only.
   */
  signupMode: text("signup_mode").$type<"passcode" | "open" | "closed">().notNull().default("passcode"),
  /** Null falls back to SIGNUP_PASSCODE, which is where it lived before. */
  signupPasscode: text("signup_passcode"),
  /** Organizer app shut for everyone but staff. Guests and the bot keep working. */
  maintenance: boolean("maintenance").notNull().default(false),
  maintenanceMessage: text("maintenance_message"),
  /** Copied onto each new account; null is no limit. */
  defaultMaxEvents: integer("default_max_events"),
  defaultMaxGuestsPerEvent: integer("default_max_guests_per_event"),
  /** What one guest's place costs, in centavos, IVA included. */
  pricePerGuestMinor: integer("price_per_guest_minor").notNull().default(1000),
  currency: text("currency").notNull().default("MXN"),
  /**
   * The smallest purchase, in places. Below this Stripe's fixed fee eats the
   * margin, so a smaller need is rounded up to it — the extra places stay on
   * the event for later.
   */
  minimumSlots: integer("minimum_slots").notNull().default(20),
  /** Simulator turns an unpaid event gets; each one is a real model call. */
  freeSimulatorTurns: integer("free_simulator_turns").notNull().default(20),
  /**
   * The webhook endpoint the admin created through Stripe's API, and the
   * signing secret Stripe returned for it — shown once, so it is kept here.
   * STRIPE_WEBHOOK_SECRET, when set, wins.
   */
  stripeWebhookId: text("stripe_webhook_id"),
  stripeWebhookSecret: text("stripe_webhook_secret"),
  /** The same, for the sandbox. The two above are the live account's. */
  stripeTestWebhookId: text("stripe_test_webhook_id"),
  stripeTestWebhookSecret: text("stripe_test_webhook_secret"),
  /**
   * Which Stripe takes new payments: `test` (sandbox) or `live`. Null until
   * someone chooses, which means live when its keys exist, else the sandbox.
   */
  stripeMode: text("stripe_mode").$type<"test" | "live">(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByUserId: text("updated_by_user_id"),
});

/**
 * One purchase of guest places for one event, from the moment the organizer
 * goes to pay. Stripe's webhook moves it to `paid`, and only that move adds
 * the places to the event — so a page reload or a replayed webhook cannot
 * credit a payment twice.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    slots: integer("slots").notNull(),
    unitAmountMinor: integer("unit_amount_minor").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    /**
     * `pending` until Stripe says otherwise; OXXO and SPEI stay here for days.
     * `refunded` and `canceled` are staff decisions after the fact; both take
     * the payment's places back off the event.
     */
    status: text("status")
      .$type<"pending" | "paid" | "failed" | "expired" | "refunded" | "canceled">()
      .notNull()
      .default("pending"),
    stripeSessionId: text("stripe_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    /**
     * Which Stripe this went through. Test payments are play money: kept out
     * of the sales figures, and refunded with the sandbox's keys.
     */
    livemode: boolean("livemode").notNull().default(false),
    /** card, oxxo, customer_balance… as Stripe reports it once paid; `manual` for one staff recorded. */
    method: text("method"),
    /** What staff wrote: why a manual payment exists, or why one was cancelled. */
    note: text("note"),
    stripeRefundId: text("stripe_refund_id"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    canceledByUserId: text("canceled_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("payments_stripe_session_key").on(t.stripeSessionId),
    index("payments_event_idx").on(t.eventId, t.createdAt),
    index("payments_status_idx").on(t.status, t.paidAt),
  ],
);

/**
 * Every call to Claude, with what it used and what it cost us. The cost is
 * computed when the row is written, at the price of the model that answered,
 * so a later price change does not rewrite history.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "set null" }),
    /** `guest_reply`, `simulator`, `name_split`. */
    source: text("source").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** Millionths of a US dollar. */
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_event_idx").on(t.eventId, t.createdAt),
    index("ai_usage_created_idx").on(t.createdAt),
  ],
);

/**
 * A courtesy code: places for a first event, for the first N accounts that
 * use it. Made in /admin for marketing ("los primeros 10, 50 invitados") and
 * for trying the whole flow before anyone pays.
 *
 * One use per account. `redeemedCount` is what closes the code, kept on the
 * row and moved under a lock so two people redeeming the last place at once
 * cannot both get it.
 */
export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored upper-case; typed in any case. */
    code: text("code").notNull(),
    slotsPerUser: integer("slots_per_user").notNull(),
    maxRedemptions: integer("max_redemptions").notNull(),
    redeemedCount: integer("redeemed_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    /** Where it was announced, for whoever reads the list later. */
    note: text("note"),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("promo_codes_code_key").on(t.code)],
);

export const promoRedemptions = pgTable(
  "promo_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeId: uuid("code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    slots: integer("slots").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One use per account, enforced by the database.
  (t) => [uniqueIndex("promo_redemptions_code_user_key").on(t.codeId, t.userId)],
);
