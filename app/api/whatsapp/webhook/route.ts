import { and, eq, inArray, or, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import {
  guests,
  sends,
  conversations,
  messages as messageRows,
  unmatchedInbound,
} from "@/db/schema";
import { parseWebhook, verifySignature, type InboundMessage } from "@/lib/whatsapp/webhook";
import { variantsOf } from "@/lib/phone";

/**
 * Meta's webhook endpoint.
 *
 * Two hard constraints shape this handler. Meta retries on any non-200, so
 * everything it writes is idempotent — inbound messages and status updates are
 * both keyed on the provider's own message id. And Meta times out quickly, so
 * this acknowledges as soon as the facts are recorded; deciding what to reply
 * belongs in a queued job, not in the request.
 */
export const dynamic = "force-dynamic";

/** Meta's one-time subscription handshake. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected) return new Response("Not configured", { status: 500 });

  if (mode === "subscribe" && token === expected && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return new Response("Not configured", { status: 500 });

  // Read the raw body: re-serialising the parsed JSON changes byte order and
  // the signature no longer matches.
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    // Refuse loudly rather than 200 — an unverified endpoint would let anyone
    // forge an RSVP for someone else's guest.
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Malformed but authentic: acknowledge so Meta stops redelivering it.
    return new Response("ok", { status: 200 });
  }

  const { messages, statuses } = parseWebhook(payload);

  try {
    for (const status of statuses) await recordStatus(status);
    for (const message of messages) await recordInbound(message);
  } catch (error) {
    console.error("[whatsapp] webhook processing failed", error);
    // A 500 makes Meta redeliver, which is what we want: the writes above are
    // idempotent, so a replay costs nothing and we do not silently lose an RSVP.
    return new Response("error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

async function recordStatus(status: Awaited<ReturnType<typeof parseWebhook>>["statuses"][number]) {
  if (!status.wamid) return;

  const timestamps: Record<string, unknown> = {};
  if (status.status === "sent") timestamps.sentAt = status.timestamp;
  if (status.status === "delivered") timestamps.deliveredAt = status.timestamp;
  if (status.status === "read") timestamps.readAt = status.timestamp;

  await db
    .update(sends)
    .set({
      status: status.status,
      errorCode: status.errorCode,
      errorTitle: status.errorTitle,
      pricingCategory: status.pricingCategory as never,
      ...timestamps,
    })
    .where(eq(sends.providerMessageId, status.wamid));
}

async function recordInbound(message: InboundMessage) {
  if (!message.wamid || !message.from) return;

  // Match on every plausible form of the number. Meta is inconsistent about
  // whether Mexican numbers come back with the legacy "1" after +52, so an
  // equality check on the canonical value drops replies on the floor.
  //
  // Built from Drizzle operators rather than a raw fragment: passing a JS array
  // through the template bound it as a parameter list rather than a single
  // array, and jsonb's `?|` does not survive a placeholder layer intact.
  const candidates = variantsOf(`+${message.from.replace(/^\+/, "")}`);
  const guest = await db.query.guests.findFirst({
    where: or(
      inArray(guests.phoneE164, candidates),
      ...candidates.map(
        (candidate) => raw`${guests.phoneVariants} @> ${JSON.stringify([candidate])}::jsonb`,
      ),
    ),
  });
  if (!guest) {
    // Keep it rather than dropping it: this is a forwarded invitation, a guest
    // on a second phone, a mistyped number, or a stranger — all of which the
    // organizer should be able to see.
    await db
      .insert(unmatchedInbound)
      .values({
        phoneNumberId: message.phoneNumberId,
        fromPhone: `+${message.from.replace(/^\+/, "")}`,
        profileName: message.profileName,
        body: message.text,
        providerMessageId: message.wamid,
        raw: message.raw as never,
        receivedAt: message.timestamp,
      })
      .onConflictDoNothing({ target: unmatchedInbound.providerMessageId });
    return;
  }

  let conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.guestId, guest.id), eq(conversations.channel, "whatsapp")),
  });

  // Every inbound message reopens the 24-hour customer service window, which is
  // the only period in which the assistant may reply in free form.
  const windowExpiresAt = new Date(message.timestamp.getTime() + 24 * 60 * 60 * 1000);

  if (!conversation) {
    [conversation] = await db
      .insert(conversations)
      .values({
        eventId: guest.eventId,
        guestId: guest.id,
        channel: "whatsapp",
        peerPhoneE164: guest.phoneE164,
        windowExpiresAt,
        lastInboundAt: message.timestamp,
      })
      .returning();
  } else {
    await db
      .update(conversations)
      .set({ windowExpiresAt, lastInboundAt: message.timestamp, status: "active" })
      .where(eq(conversations.id, conversation.id));
  }

  await db
    .insert(messageRows)
    .values({
      conversationId: conversation.id,
      direction: "inbound",
      body: message.text,
      providerMessageId: message.wamid,
      raw: message.raw as never,
      createdAt: message.timestamp,
    })
    // The idempotency guard: a redelivered webhook writes nothing the second time.
    .onConflictDoNothing({ target: messageRows.providerMessageId });
}
