import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  guests,
  suppressions,
  conversations,
  messages as messageRows,
  sends,
} from "@/db/schema";
import { variantsOf } from "@/lib/phone";
import {
  whatsappConfig,
  activeProfile,
  type WhatsAppConfig,
  sendText,
  sendTemplate,
  sendImage,
  sendLocation,
  type LocationPayload,
  type SendResult,
  type TemplateComponent,
} from "./client";

/**
 * The outbound counterpart to the webhook: everything the app sends to a guest
 * goes through here, and every attempt lands in the `sends` ledger.
 *
 * `lib/whatsapp/client.ts` is deliberately ignorant of the database — it speaks
 * Graph API and nothing else. This module is where a send becomes a durable
 * fact: suppression checked, window checked, ledger written, conversation
 * advanced. Calling the client directly from a route skips all of that and
 * leaves a message that reached a guest with nothing to show for it.
 */

export type SendFailureReason =
  | "not_found"
  | "no_phone"
  | "opted_out"
  | "suppressed"
  | "window_closed"
  | "not_configured"
  | "provider_error";

export type SendOutcome =
  | { ok: true; sendId: string; messageId: string }
  | {
      ok: false;
      /** Null only when the failure was caught before the ledger row existed. */
      sendId: string | null;
      reason: SendFailureReason;
      detail: string;
      retryable: boolean;
    };

type SendKind = (typeof sends.kind.enumValues)[number];

/**
 * Free-form text. Legal only inside the 24-hour customer service window, which
 * only a guest's own inbound message opens — so this refuses rather than lets
 * Meta reject it, and the caller falls back to `sendTemplateToGuest`.
 */
export async function sendTextToGuest(
  guestId: string,
  body: string,
  kind: SendKind = "custom",
  config?: WhatsAppConfig,
): Promise<SendOutcome> {
  return deliver({ guestId, kind, requireOpenWindow: true, body, config }, (account, to) =>
    sendText(account, to, body),
  );
}

/**
 * An image the guest did not ask for but will want — the invitation card, once
 * they have confirmed. Free-form, so the same window rule applies: this can
 * only follow something the guest sent us.
 */
export async function sendImageToGuest(
  guestId: string,
  mediaId: string,
  kind: SendKind = "custom",
  caption?: string,
  config?: WhatsAppConfig,
): Promise<SendOutcome> {
  return deliver(
    { guestId, kind, requireOpenWindow: true, body: caption ?? "[image]", config },
    (account, to) => sendImage(account, to, mediaId, caption),
  );
}

/**
 * Pre-approved template. The only thing we may send to open a conversation, and
 * therefore the path every invitation and reminder takes.
 */
export async function sendTemplateToGuest(
  guestId: string,
  template: { name: string; language: string; components?: TemplateComponent[] },
  kind: SendKind = "invite",
  config?: WhatsAppConfig,
): Promise<SendOutcome> {
  return deliver(
    {
      guestId,
      kind,
      requireOpenWindow: false,
      body: `[template:${template.name}]`,
      templateName: template.name,
      templateLanguage: template.language,
      config,
    },
    (account, to) =>
      sendTemplate(account, to, template.name, template.language, template.components ?? []),
  );
}

/**
 * A native map card. Free-form, so the guest must have written to us first —
 * which they have, since this only answers someone asking where the party is.
 */
export async function sendLocationToGuest(
  guestId: string,
  location: LocationPayload,
  kind: SendKind = "logistics",
  config?: WhatsAppConfig,
): Promise<SendOutcome> {
  const label = [location.name, location.address].filter(Boolean).join(" · ");
  return deliver(
    { guestId, kind, requireOpenWindow: true, body: `[location] ${label}`.trim(), config },
    (account, to) => sendLocation(account, to, location),
  );
}

type DeliverInput = {
  guestId: string;
  kind: SendKind;
  requireOpenWindow: boolean;
  /** What gets written to `messages.body` — the text, or a template marker. */
  body: string;
  templateName?: string;
  templateLanguage?: string;
  /**
   * The number to send through, when the caller already knows. A reply knows:
   * it goes out on whichever of our numbers the guest wrote to. Anything we
   * start ourselves has no such constraint and takes the active profile.
   */
  config?: WhatsAppConfig;
};

async function deliver(
  input: DeliverInput,
  call: (config: WhatsAppConfig, to: string) => Promise<SendResult>,
): Promise<SendOutcome> {
  const fail = (reason: SendFailureReason, detail: string, retryable = false): SendOutcome => ({
    ok: false,
    sendId: null,
    reason,
    detail,
    retryable,
  });

  // Resolved from the environment rather than `whatsapp_accounts`, which is
  // still empty. When a customer gets their own WABA the lookup moves there and
  // `sends.whatsappAccountId` stops being null; nothing else here changes.
  const config = input.config ?? whatsappConfig();
  if (!config) {
    return fail(
      "not_configured",
      `No phone number id or access token for the ${activeProfile()} profile`,
    );
  }

  const guest = await db.query.guests.findFirst({ where: eq(guests.id, input.guestId) });
  if (!guest) return fail("not_found", `No guest ${input.guestId}`);
  if (!guest.phoneE164) return fail("no_phone", `Guest ${guest.fullName} has no phone number`);

  if (guest.optedOut) return fail("opted_out", `${guest.fullName} opted out of this event`);

  // The global opt-out list. Checked on every send, not as a courtesy but
  // because LFPDPPP requires it — see the comment on the table.
  const candidates = variantsOf(guest.phoneE164);
  const suppressed = await db.query.suppressions.findFirst({
    where: inArray(suppressions.phoneE164, candidates),
  });
  if (suppressed) {
    return fail("suppressed", `${guest.phoneE164} is suppressed (${suppressed.reason})`);
  }

  let conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.guestId, guest.id), eq(conversations.channel, "whatsapp")),
  });

  if (input.requireOpenWindow) {
    const expires = conversation?.windowExpiresAt;
    if (!expires || expires.getTime() <= Date.now()) {
      return fail(
        "window_closed",
        expires
          ? `Service window closed at ${expires.toISOString()}; send a template instead`
          : "Guest has never messaged us, so no service window is open; send a template instead",
      );
    }
  }

  if (!conversation) {
    // A template send opens the thread but not the service window — only the
    // guest's own reply does that, so `windowExpiresAt` stays null here.
    [conversation] = await db
      .insert(conversations)
      .values({
        eventId: guest.eventId,
        guestId: guest.id,
        channel: "whatsapp",
        peerPhoneE164: guest.phoneE164,
      })
      .returning();
  }

  // The ledger row goes in before the network call, so a send that succeeds at
  // Meta and then dies on the way home still leaves evidence. The schema's
  // NULLS DISTINCT on provider_message_id exists for exactly this window.
  const [send] = await db
    .insert(sends)
    .values({
      eventId: guest.eventId,
      guestId: guest.id,
      channel: "whatsapp",
      kind: input.kind,
      templateName: input.templateName ?? null,
      templateLanguage: input.templateLanguage ?? null,
      status: "queued",
    })
    .returning();

  // Meta wants the canonical +52 form, never the 521 wa_id it echoes on
  // inbound webhooks — sending the latter is rejected outright. `phoneE164` is
  // already canonical because `normalizePhone` collapses the legacy prefix.
  const result = await call(config, guest.phoneE164);

  if (!result.ok) {
    await db
      .update(sends)
      .set({ status: "failed", errorCode: result.code, errorTitle: result.title })
      .where(eq(sends.id, send.id));

    return {
      ok: false,
      sendId: send.id,
      reason: "provider_error",
      detail: result.detail ? `${result.title}: ${result.detail}` : result.title,
      retryable: result.retryable,
    };
  }

  const sentAt = new Date();

  await db
    .update(sends)
    .set({ status: "sent", providerMessageId: result.messageId, sentAt })
    .where(eq(sends.id, send.id));

  // Mirrors the inbound write in the webhook, so a conversation reads as one
  // thread. Idempotent on the wamid for the same reason.
  await db
    .insert(messageRows)
    .values({
      conversationId: conversation.id,
      direction: "outbound",
      body: input.body,
      providerMessageId: result.messageId,
      // Which number this went out on. `sends` has no column for it and
      // `whatsapp_accounts` is still empty, but with two live numbers a thread
      // that cannot say which one it used is a thread nobody can debug.
      raw: {
        sendId: send.id,
        kind: input.kind,
        template: input.templateName ?? null,
        profile: config.profile,
        phoneNumberId: config.phoneNumberId,
      } as never,
      createdAt: sentAt,
    })
    .onConflictDoNothing({ target: messageRows.providerMessageId });

  await db
    .update(conversations)
    .set({ lastOutboundAt: sentAt })
    .where(eq(conversations.id, conversation.id));

  return { ok: true, sendId: send.id, messageId: result.messageId };
}
