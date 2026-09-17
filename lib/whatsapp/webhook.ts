import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verification and parsing for Meta's webhook deliveries.
 *
 * Two rules drive the shape of this file. Meta signs every delivery, and an
 * unverified endpoint lets anyone forge a guest RSVP. And Meta redelivers on
 * any non-200, so the handler must acknowledge fast and be safe to run twice —
 * every message carries an id that the database uses to deduplicate.
 */

/**
 * HMAC-SHA256 of the raw body against the app secret, compared in constant
 * time. The raw bytes matter: re-serialising the parsed JSON changes key order
 * and whitespace, and the signature stops matching.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  if (received.length !== expected.length) return false;

  return timingSafeEqual(expected, received);
}

export type InboundMessage = {
  wamid: string;
  from: string;
  timestamp: Date;
  phoneNumberId: string;
  profileName: string | null;
  /** Present for text messages and for the label of a tapped button. */
  text: string | null;
  /** Set when the guest tapped a quick-reply button on a template. */
  buttonPayload: string | null;
  /**
   * The `wamid` of *our* message this one replies to, when WhatsApp says so.
   *
   * This is how an inbound message names the event it belongs to. A phone
   * number does not: the same person can be a guest at two of an organizer's
   * events, and `guests` is unique on (event, phone) precisely to allow that.
   */
  contextWamid: string | null;
  type: string;
  raw: unknown;
};

export type StatusUpdate = {
  wamid: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  recipient: string;
  /** Meta's billing category for the conversation this message belonged to. */
  pricingCategory: string | null;
  billable: boolean | null;
  errorCode: string | null;
  errorTitle: string | null;
};

type Payload = {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: Record<string, unknown>[];
        statuses?: Record<string, unknown>[];
      };
    }[];
  }[];
};

const asDate = (seconds: unknown) => new Date(Number(seconds) * 1000);

/**
 * Flattens Meta's deeply nested envelope into the two things we act on.
 * A single delivery can carry several entries, each with several changes.
 */
export function parseWebhook(body: unknown): {
  messages: InboundMessage[];
  statuses: StatusUpdate[];
} {
  const payload = body as Payload;
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      const profileName = value.contacts?.[0]?.profile?.name ?? null;

      for (const message of value.messages ?? []) {
        const type = String(message.type ?? "unknown");
        const interactive = message.interactive as
          | { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } }
          | undefined;
        const button = message.button as { payload?: string; text?: string } | undefined;

        // A tapped quick reply arrives as `button` on a template reply, or as
        // `interactive.button_reply` on an interactive message. Both carry a
        // payload we control, which is far more reliable than parsing the label.
        const buttonPayload =
          button?.payload ?? interactive?.button_reply?.id ?? interactive?.list_reply?.id ?? null;

        const text =
          (message.text as { body?: string } | undefined)?.body ??
          button?.text ??
          interactive?.button_reply?.title ??
          interactive?.list_reply?.title ??
          null;

        const context = message.context as { id?: string } | undefined;

        messages.push({
          wamid: String(message.id ?? ""),
          contextWamid: context?.id ? String(context.id) : null,
          from: String(message.from ?? ""),
          timestamp: asDate(message.timestamp),
          phoneNumberId,
          profileName,
          text,
          buttonPayload,
          type,
          raw: message,
        });
      }

      for (const status of value.statuses ?? []) {
        const errors = status.errors as { code?: number; title?: string }[] | undefined;
        const pricing = status.pricing as { category?: string; billable?: boolean } | undefined;

        statuses.push({
          wamid: String(status.id ?? ""),
          status: String(status.status ?? "") as StatusUpdate["status"],
          timestamp: asDate(status.timestamp),
          recipient: String(status.recipient_id ?? ""),
          pricingCategory: pricing?.category ?? null,
          billable: pricing?.billable ?? null,
          errorCode: errors?.[0]?.code != null ? String(errors[0].code) : null,
          errorTitle: errors?.[0]?.title ?? null,
        });
      }
    }
  }

  return { messages, statuses };
}
