import { pgEnum } from "drizzle-orm/pg-core";

export const eventKind = pgEnum("event_kind", [
  "wedding",
  "birthday",
  "quinceanera",
  "corporate",
  "product_launch",
  "anniversary",
  "baby_shower",
  "graduation",
  "other",
]);

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

export const channel = pgEnum("channel", ["whatsapp", "sms", "email"]);

export const sendKind = pgEnum("send_kind", [
  "save_the_date",
  "invite",
  "reminder",
  "rsvp_confirmation",
  "logistics",
  "organizer_relay",
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
