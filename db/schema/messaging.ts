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
import { organizations } from "./org";
import { events } from "./events";
import { guests } from "./guests";
import {
  channel,
  sendKind,
  sendStatus,
  pricingCategory,
  conversationStatus,
  escalationStatus,
  messageDirection,
  templateStatus,
} from "./enums";

/**
 * Multi-tenant from day one. The prototype has exactly one row with `orgId = null`
 * (the platform number); moving a customer onto their own WABA later is an INSERT,
 * not a refactor. Every send resolves its sending account through this table.
 */
export const whatsappAccounts = pgTable(
  "whatsapp_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null means the shared platform account. */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    isPlatform: boolean("is_platform").notNull().default(false),

    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    displayPhone: text("display_phone").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),

    /** Mirrored from Meta webhooks. The send pacer reads these before every batch. */
    qualityRating: text("quality_rating").$type<"GREEN" | "YELLOW" | "RED" | "UNKNOWN">(),
    messagingTier: text("messaging_tier"),
    tierDailyLimit: integer("tier_daily_limit").notNull().default(250),

    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("whatsapp_accounts_phone_number_key").on(t.phoneNumberId),
    index("whatsapp_accounts_org_idx").on(t.orgId),
  ],
);

/**
 * Mirror of the templates approved on Meta's side. You cannot create a template per
 * event — approval is manual and slow — so this stays a small library of parameterised
 * templates ({{1}} guest name, {{2}} event name, …) that serve every event forever.
 */
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    whatsappAccountId: uuid("whatsapp_account_id")
      .notNull()
      .references(() => whatsappAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull().default("es_MX"),
    category: pricingCategory("category").notNull(),
    kind: sendKind("kind").notNull(),
    status: templateStatus("status").notNull().default("pending"),
    metaTemplateId: text("meta_template_id"),
    /** The component structure as submitted, for rendering previews locally. */
    components: jsonb("components").notNull(),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("message_templates_account_name_lang_key").on(t.whatsappAccountId, t.name, t.language)],
);

/** One scheduled batch of sends, owned by an Inngest run. */
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: sendKind("kind").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    status: text("status")
      .$type<"draft" | "scheduled" | "running" | "paused" | "done" | "failed">()
      .notNull()
      .default("draft"),
    inngestRunId: text("inngest_run_id"),
    totalCount: integer("total_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("campaigns_event_idx").on(t.eventId)],
);

/**
 * The message ledger — every outbound attempt, kept forever. This is simultaneously the
 * billing source of truth, the deliverability dashboard, and the first place to look
 * when a guest swears they never got the invite. Not a log.
 */
export const sends = pgTable(
  "sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    whatsappAccountId: uuid("whatsapp_account_id").references(() => whatsappAccounts.id),

    channel: channel("channel").notNull(),
    kind: sendKind("kind").notNull(),
    templateName: text("template_name"),
    templateLanguage: text("template_language"),
    variables: jsonb("variables").$type<Record<string, string>>().notNull().default({}),

    /** Meta's `wamid`, Resend's id, etc. Unique so webhook redelivery is idempotent. */
    providerMessageId: text("provider_message_id"),
    status: sendStatus("status").notNull().default("queued"),
    errorCode: text("error_code"),
    errorTitle: text("error_title"),

    pricingCategory: pricingCategory("pricing_category"),
    costMinor: integer("cost_minor"),
    costCurrency: text("cost_currency"),

    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    // NULLS DISTINCT is required: every send is NULL here until the provider responds.
    uniqueIndex("sends_provider_message_id_key").on(t.providerMessageId),
    index("sends_event_idx").on(t.eventId),
    index("sends_guest_idx").on(t.guestId),
    index("sends_status_idx").on(t.status),
  ],
);

/**
 * One thread per participant. `windowExpiresAt` is the WhatsApp 24-hour customer service
 * window — the agent checks it before every outbound and falls back to a template when
 * it has closed.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** Exactly one of these is set. */
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "cascade" }),
    organizerUserId: text("organizer_user_id"),

    channel: channel("channel").notNull().default("whatsapp"),
    whatsappAccountId: uuid("whatsapp_account_id").references(() => whatsappAccounts.id),
    peerPhoneE164: text("peer_phone_e164"),

    windowExpiresAt: timestamp("window_expires_at", { withTimezone: true }),
    language: text("language"),
    /** Agent state machine scratchpad — pending questions, last intent, retry counts. */
    state: jsonb("state").notNull().default({}),
    status: conversationStatus("status").notNull().default("active"),

    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversations_event_idx").on(t.eventId),
    // Organizer conversations have a NULL guest_id and must not collide with each other.
    uniqueIndex("conversations_guest_channel_key").on(t.guestId, t.channel),
    index("conversations_peer_idx").on(t.peerPhoneE164),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirection("direction").notNull(),
    body: text("body"),
    media: jsonb("media").notNull().default([]),

    /** Meta redelivers webhooks on any non-200; this unique index is the dedupe. */
    providerMessageId: text("provider_message_id"),
    /** Raw provider payload, kept for debugging the parts of the API that surprise us. */
    raw: jsonb("raw"),

    aiGenerated: boolean("ai_generated").notNull().default(false),
    model: text("model"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Same as `sends`: outbound rows are written before the provider id exists.
    uniqueIndex("messages_provider_message_id_key").on(t.providerMessageId),
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
  ],
);

/**
 * Inbound messages from a number that matches no guest on any event.
 *
 * These are real and worth keeping rather than dropping: someone forwarded an
 * invitation, a guest replied from their other phone, a number was typed wrong
 * in the list, or a stranger found the business number. Dropping them silently
 * means an RSVP can disappear with nothing to show for it, and during setup it
 * makes a working webhook indistinguishable from a broken one.
 */
export const unmatchedInbound = pgTable(
  "unmatched_inbound",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    whatsappAccountId: uuid("whatsapp_account_id").references(() => whatsappAccounts.id),
    phoneNumberId: text("phone_number_id"),
    fromPhone: text("from_phone").notNull(),
    profileName: text("profile_name"),
    body: text("body"),
    providerMessageId: text("provider_message_id"),
    raw: jsonb("raw"),
    /** Set once an organizer says which guest this actually was. */
    resolvedGuestId: uuid("resolved_guest_id"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("unmatched_inbound_provider_message_id_key").on(t.providerMessageId),
    index("unmatched_inbound_from_idx").on(t.fromPhone),
  ],
);

/**
 * The escalation loop, and the reason an event gets smarter over its own lifetime:
 * guest asks something not in the facts -> organizer is asked once on their own WhatsApp
 * -> the answer is relayed to everyone waiting and written back into `event_facts`.
 */
export const escalations = pgTable(
  "escalations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** The guest conversation that first raised it. */
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),

    questionText: text("question_text").notNull(),
    /** Dedupe key — six guests asking about kids produce one ping, six answers. */
    questionNormalized: text("question_normalized").notNull(),
    /** Everyone waiting on this answer, including the original asker. */
    waitingGuestIds: jsonb("waiting_guest_ids").$type<string[]>().notNull().default([]),

    status: escalationStatus("status").notNull().default("open"),
    askedOrganizerAt: timestamp("asked_organizer_at", { withTimezone: true }),
    organizerMessageId: uuid("organizer_message_id"),
    /**
     * The `wamid` of the question we put on the responder's phone.
     *
     * This is how their reply finds its way back. WhatsApp tells us which
     * message a quoted reply answers, so matching on it is exact — no parsing,
     * no guessing which of two open questions they meant. Which is also why an
     * organizador who answers without quoting is asked to quote: there is
     * nothing to match, and attaching an answer to the wrong question is worse
     * than asking again.
     */
    organizerWamid: text("organizer_wamid"),
    answerText: text("answer_text"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    /** FK added later — circular with event_facts.origin_escalation_id. */
    resultingFactId: uuid("resulting_fact_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A wamid names exactly one message, so it names at most one question. The
    // index says so rather than trusting every caller to.
    uniqueIndex("escalations_organizer_wamid_key").on(t.organizerWamid),
    index("escalations_event_status_idx").on(t.eventId, t.status),
    index("escalations_normalized_idx").on(t.eventId, t.questionNormalized),
  ],
);
