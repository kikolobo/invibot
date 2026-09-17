import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  doublePrecision,
  uniqueIndex,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./org";
import {
  eventKind,
  eventStatus,
  factSource,
  factVisibility,
  designFormat,
} from "./enums";
import type { EventDetails } from "@/lib/events/details";

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull(),

    /** Public microsite path: /i/{slug}?t={guest token} */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: eventKind("kind").notNull(),
    status: eventStatus("status").notNull().default("draft"),
    /** Who is hosting, as guests should read it: "Ana & Carlos", "Familia González". */
    hostNames: text("host_names"),

    // Always store absolute instants; `timezone` is what "7 PM" meant to the organizer
    // and is what every rendered string and reminder schedule is computed against.
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timezone: text("timezone").notNull().default("America/Mexico_City"),
    locale: text("locale").notNull().default("es-MX"),

    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    venueCity: text("venue_city"),
    venueState: text("venue_state"),
    venueCountry: text("venue_country").default("MX"),
    venueLat: doublePrecision("venue_lat"),
    venueLng: doublePrecision("venue_lng"),
    venuePlaceId: text("venue_place_id"),
    venueMapsUrl: text("venue_maps_url"),

    // Behaviour-driving fields live as columns, not in `details`.
    rsvpRequired: boolean("rsvp_required").notNull().default(true),
    rsvpDeadline: timestamp("rsvp_deadline", { withTimezone: true }),
    allowPlusOnes: boolean("allow_plus_ones").notNull().default(false),
    maxPartySize: integer("max_party_size").notNull().default(1),
    capacity: integer("capacity"),

    /** Intake questionnaire answers. Validated by `eventDetailsSchema`. */
    details: jsonb("details").$type<EventDetails>().notNull(),

    /** FK added in a follow-up migration — circular with designs.event_id. */
    coverDesignId: uuid("cover_design_id"),

    /**
     * The invitation card the organizer uploaded, sent to each guest right after
     * they confirm. Distinct from `designs`, which is never a file — this is one
     * image the organizer already had, not something the renderer produces.
     *
     * Held privately in R2: a card carries a venue, a date and a family's names,
     * and a public URL for it is a public URL forever. WhatsApp receives the
     * bytes through Meta's media endpoint instead of a link.
     */
    cardR2Key: text("card_r2_key"),
    cardContentType: text("card_content_type"),
    cardBytes: integer("card_bytes"),
    cardUploadedAt: timestamp("card_uploaded_at", { withTimezone: true }),
    /** Meta's media handle for the same file. Expires; re-uploaded from R2 when it does. */
    cardMediaId: text("card_media_id"),
    cardMediaRefreshedAt: timestamp("card_media_refreshed_at", { withTimezone: true }),

    publishedAt: timestamp("published_at", { withTimezone: true }),
    /**
     * Soft delete. Separate from `status` on purpose: that column is the event's
     * lifecycle (draft → live → closed) and archiving is orthogonal to it, so a
     * closed event that gets archived and restored comes back closed rather than
     * having lost where it was. Null means active.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("events_slug_key").on(t.slug),
    index("events_org_idx").on(t.orgId),
    index("events_starts_at_idx").on(t.startsAt),
  ],
);

/**
 * The event's knowledge base and the agent's entire factual context. Intake answers are
 * projected in here, and answers learned from organizer escalations are appended — so an
 * event gets better at answering guests over its own lifetime.
 */
export const eventFacts = pgTable(
  "event_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** Set when the fact was projected from a catalog question; null for learned facts. */
    key: text("key"),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    /** Lowercased, accent-stripped, stopworded — the cheap dedupe key before embeddings. */
    questionNormalized: text("question_normalized").notNull(),
    source: factSource("source").notNull(),
    visibility: factVisibility("visibility").notNull().default("public"),
    /** FK added later — circular with escalations.resulting_fact_id. */
    originEscalationId: uuid("origin_escalation_id"),
    timesUsed: integer("times_used").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("event_facts_event_idx").on(t.eventId, t.isActive),
    index("event_facts_normalized_idx").on(t.eventId, t.questionNormalized),
  ],
);

/**
 * A design is never a file — it is a template key plus design tokens plus copy. The
 * renderer turns that into pixels, which is why guest names are always spelled right and
 * every design exists in four formats for free.
 */
export const designs = pgTable(
  "designs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null on both for the built-in system templates. */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    isSystemTemplate: boolean("is_system_template").notNull().default(false),

    /** Which of the built-in layouts this derives from: "papel", "terracota", … */
    templateKey: text("template_key").notNull(),
    name: text("name").notNull(),
    /** Palette, type pairing, motif selection, ornament rules. */
    tokens: jsonb("tokens").notNull(),
    /** Headline, names, date line, venue line, footer — the words, not the layout. */
    copy: jsonb("copy").notNull(),

    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("designs_event_idx").on(t.eventId),
    index("designs_system_idx").on(t.isSystemTemplate, t.templateKey),
  ],
);

export const designRenders = pgTable(
  "design_renders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    designId: uuid("design_id")
      .notNull()
      .references(() => designs.id, { onDelete: "cascade" }),
    format: designFormat("format").notNull(),
    /** Set for per-guest personalised cards; null for the shared render. */
    guestId: uuid("guest_id"),
    r2Key: text("r2_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    /** Hash of tokens+copy+format+guest, so unchanged designs are never re-rendered. */
    checksum: text("checksum").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("design_renders_unique")
      .on(t.designId, t.format, t.guestId)
      .nullsNotDistinct(),
  ],
);
