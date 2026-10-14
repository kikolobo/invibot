import { pgTable, text, timestamp, integer, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { events } from "./events";

/**
 * invibot.com/s/{code}: a long link from a message, folded into one that fits
 * on a phone screen.
 *
 * Per event so the same playlist pasted into three messages is one code, and
 * so deleting the event takes its links with it. Never expires: the message
 * that carries it stays in the guest's chat for as long as they keep it.
 */
export const shortLinks = pgTable(
  "short_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    url: text("url").notNull(),

    /** Every tap, including the organizer's own and link-preview crawlers. */
    clicks: integer("clicks").notNull().default(0),
    lastClickedAt: timestamp("last_clicked_at", { withTimezone: true }),

    /**
     * Turned off by an organizer: /s/{code} says the link is no longer
     * available instead of following it. One link per event, so this reaches
     * every message that carries it, and pasting the same link again reuses it
     * switched off.
     */
    disabledAt: timestamp("disabled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("short_links_code_key").on(t.code),
    uniqueIndex("short_links_event_url_key").on(t.eventId, t.url),
  ],
);
