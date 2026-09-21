import { pgEnum } from "drizzle-orm/pg-core";
import { eventKinds } from "@/lib/events/kinds";

export const eventKind = pgEnum("event_kind", eventKinds);

export const eventStatus = pgEnum("event_status", [
  "draft",
  "ready",
  "sending",
  "live",
  "closed",
  "cancelled",
]);

export const rsvpStatus = pgEnum("rsvp_status", [
  "no_response",
  "confirmed",
  "declined",
  "maybe",
  "waitlist",
]);

export const inviteStatus = pgEnum("invite_status", [
  "pending",
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);

/**
 * Whether the host has let this guest in.
 *
 * A separate axis from `inviteStatus`, which is the delivery pipeline Meta
 * writes to. Sharing one column would have the host's decision and Meta's
 * receipts overwriting each other.
 *
 * Defaults to `approved` because that is what adding someone to your own guest
 * list means. Only self-registration sets `pending`, and it does so explicitly
 * — one place to get right, rather than every import and manual add having to
 * remember to say `approved`.
 */
export const approvalStatus = pgEnum("approval_status", [
  "approved",
  "pending",
  "rejected",
]);

/**
 * What an organizador may do.
 *
 * One value today, and an enum anyway: the alternative is a boolean that has to
 * be widened into an enum the first time somebody may do less, and every read
 * site rewritten at once.
 */
export const organizerRole = pgEnum("organizer_role", ["organizer"]);

/** How the guest got onto the list. `self` is auto-registro. */
export const guestSource = pgEnum("guest_source", ["manual", "self"]);

/**
 * A question we asked an unapproved registrant and are waiting on.
 *
 * It exists so the *next* message from that number can be read as an answer
 * rather than run through `parseIntent` — where "sí" to "¿actualizo tu
 * nombre?" would otherwise be recorded as confirming attendance.
 */
export const pendingQuestion = pgEnum("pending_question", [
  "name",
  "name_update",
  /**
   * Two people registered on one line and at least one surname is missing.
   * `pendingQuestionValue` holds who we are short of, so the answer knows
   * which name it completes.
   */
  "full_names",
]);

export const channel = pgEnum("channel", ["whatsapp", "sms", "email"]);

export const sendKind = pgEnum("send_kind", [
  "save_the_date",
  "invite",
  "reminder",
  "rsvp_confirmation",
  "logistics",
  "organizer_relay",
  /**
   * The fixed replies of auto-registro. Its own kind because it is the only
   * thing a guest the host has not approved may ever be sent, and `deliver()`
   * enforces exactly that.
   */
  "auto_register",
  "custom",
]);

export const sendStatus = pgEnum("send_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);

/** Meta's billing category for a template send. Drives cost attribution in `sends`. */
export const pricingCategory = pgEnum("pricing_category", [
  "marketing",
  "utility",
  "service",
  "authentication",
]);

export const factSource = pgEnum("fact_source", ["intake", "organizer", "ai"]);

/** `public` facts may be quoted to guests; `internal` are organizer-only context. */
export const factVisibility = pgEnum("fact_visibility", ["public", "internal"]);

export const conversationStatus = pgEnum("conversation_status", [
  "active",
  "paused",
  "handed_off",
  "closed",
]);

export const escalationStatus = pgEnum("escalation_status", [
  "open",
  "asked",
  "answered",
  "dismissed",
]);

export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);

export const designFormat = pgEnum("design_format", [
  "square",
  "portrait",
  "story",
  "print",
]);

export const templateStatus = pgEnum("template_status", [
  "pending",
  "approved",
  "rejected",
  "paused",
  "disabled",
]);

/**
 * What happened to a guest, in the order it happened.
 *
 * `confirmed` and `declined` can each appear several times for one person —
 * that is the point of a log rather than a pair of columns.
 */
/** Who caused it. A database-enforced vocabulary, not a string anyone can spell three ways. */
export const guestEventSource = pgEnum("guest_event_source", ["guest", "organizer", "system"]);

export const guestEventType = pgEnum("guest_event_type", [
  "invited",
  "delivered",
  "read",
  "confirmed",
  "declined",
  "opted_out",
  "party_size_changed",
  /** Auto-registro: they put themselves on the list, and what the host decided. */
  "self_registered",
  "approved",
  "rejected",
  /**
   * The one nudge to answer an invitation. `detail.via` says whether it went
   * free-form inside the guest's own window or as a paid template once it had
   * closed — the difference is the whole design of `rsvp-reminder.ts`.
   */
  "reminded",
]);

/** A pass is never edited back to life: cancelling revokes it and confirming mints a new one. */
export const passStatus = pgEnum("pass_status", ["active", "revoked"]);
