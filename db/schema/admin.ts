import { pgTable, text, timestamp, uuid, jsonb, index, boolean, integer } from "drizzle-orm/pg-core";
import { users } from "./auth";

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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByUserId: text("updated_by_user_id"),
});
