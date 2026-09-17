import { after } from "next/server";
import { and, desc, eq, inArray, isNotNull, or, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import {
  guests,
  events,
  sends,
  conversations,
  messages as messageRows,
  unmatchedInbound,
} from "@/db/schema";
import { parseWebhook, verifySignature, type InboundMessage } from "@/lib/whatsapp/webhook";
import { variantsOf } from "@/lib/phone";
import {
  parseIntent,
  applyIntent,
  replyFor,
  isConfirmation,
  type GuestIntent,
} from "@/lib/whatsapp/intents";
import { sendTextToGuest, sendTemplateToGuest, sendImageToGuest } from "@/lib/whatsapp/send";
import { resolveCardMediaId } from "@/lib/events/card-media";
import { answerGuest } from "@/lib/agent/respond";
import { recordGuestEvent } from "@/lib/guests/history";
import { sendPasses } from "@/lib/passes/send";
import { buildComponents } from "@/lib/whatsapp/templates";
import { configFromEnv, markRead } from "@/lib/whatsapp/client";
import { formatEventWhen, formatEventWhere } from "@/lib/events/format";

type GuestRow = typeof guests.$inferSelect;

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

  const answerable: { guest: GuestRow; intent: GuestIntent; at: Date; wamid: string }[] = [];

  try {
    for (const status of statuses) await recordStatus(status);
    for (const message of messages) {
      const handled = await recordInbound(message);
      if (handled) answerable.push(handled);
    }
  } catch (error) {
    console.error("[whatsapp] webhook processing failed", error);
    // A 500 makes Meta redeliver, which is what we want: the writes above are
    // idempotent, so a replay costs nothing and we do not silently lose an RSVP.
    return new Response("error", { status: 500 });
  }

  // Recording is a fact and belongs in the request; deciding what to say back
  // is not, and Meta is holding the connection open while we think. `after`
  // runs once the 200 is on the wire — the same seam Inngest will take over,
  // which is where this belongs the moment a reply needs retries or ordering.
  if (answerable.length > 0) {
    after(async () => {
      for (const { guest, intent, at, wamid } of answerable) {
        try {
          await respond(guest, intent, at, wamid);
        } catch (error) {
          console.error("[whatsapp] reply failed", guest.id, intent, error);
        }
      }
    });
  }

  return new Response("ok", { status: 200 });
}

/**
 * How far an invitation has got, for the guest list. Meta delivers these out of
 * order often enough to matter, so a late "delivered" must never walk a guest
 * back from "read".
 */
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
};

async function recordStatus(status: Awaited<ReturnType<typeof parseWebhook>>["statuses"][number]) {
  if (!status.wamid) return;

  const timestamps: Record<string, unknown> = {};
  if (status.status === "sent") timestamps.sentAt = status.timestamp;
  if (status.status === "delivered") timestamps.deliveredAt = status.timestamp;
  if (status.status === "read") timestamps.readAt = status.timestamp;

  const [send] = await db
    .update(sends)
    .set({
      status: status.status,
      errorCode: status.errorCode,
      errorTitle: status.errorTitle,
      pricingCategory: status.pricingCategory as never,
      ...timestamps,
    })
    .where(eq(sends.providerMessageId, status.wamid))
    .returning({ guestId: sends.guestId, kind: sends.kind });

  // The ledger is the record of every message; `guests.inviteStatus` is the one
  // column the organizer actually reads, and only the invitation defines it. A
  // reminder being read says nothing about whether the invitation arrived.
  if (!send?.guestId || send.kind !== "invite") return;

  const guest = await db.query.guests.findFirst({ where: eq(guests.id, send.guestId) });
  if (!guest) return;

  const next = status.status;
  const isProgress = (STATUS_RANK[next] ?? 0) > (STATUS_RANK[guest.inviteStatus] ?? 0);

  // A failure always lands: it is the state worth acting on, and it can only
  // arrive after the send it belongs to.
  if (next !== "failed" && !isProgress) return;

  await db
    .update(guests)
    .set({ inviteStatus: next, updatedAt: new Date() })
    .where(eq(guests.id, guest.id));

  // Meta's timestamp, not ours — a webhook can arrive late or be replayed, and
  // "when did they open it" should mean when they opened it.
  if (next === "delivered" || next === "read") {
    await recordGuestEvent({
      eventId: guest.eventId,
      guestId: guest.id,
      type: next,
      at: status.timestamp,
      source: "system",
    });
  }
}

/**
 * Which guest — and therefore which event — this message belongs to.
 *
 * A phone number alone does not answer that. `guests` is unique on (event,
 * phone), so one person can be a guest at several of an organizer's events, and
 * matching on the number alone returns whichever row the database felt like
 * first. That was already wrong for button taps; with an assistant answering
 * questions it would mean answering about the wrong party.
 */
async function resolveGuest(message: InboundMessage): Promise<GuestRow | null> {
  // Meta is inconsistent about the legacy "1" after +52, so match every form.
  // Built from Drizzle operators rather than a raw fragment: a JS array through
  // the template bound as a parameter list, and jsonb's `?|` does not survive a
  // placeholder layer intact.
  const candidates = variantsOf(`+${message.from.replace(/^\+/, "")}`);
  const matches = await db
    .select()
    .from(guests)
    .where(
      or(
        inArray(guests.phoneE164, candidates),
        ...candidates.map(
          (candidate) => raw`${guests.phoneVariants} @> ${JSON.stringify([candidate])}::jsonb`,
        ),
      ),
    );

  if (matches.length <= 1) return matches[0] ?? null;

  // WhatsApp tells us which of our messages this replies to, which names the
  // event exactly. Button taps always carry it.
  if (message.contextWamid) {
    const send = await db.query.sends.findFirst({
      where: eq(sends.providerMessageId, message.contextWamid),
    });
    const exact = send?.guestId && matches.find((row) => row.id === send.guestId);
    if (exact) return exact;
  }

  // Free-typed text carries no context. Fall back to the event we contacted
  // this person about most recently — someone replying out of the blue is
  // almost always answering the last thing they received.
  const [latest] = await db
    .select({ guestId: sends.guestId })
    .from(sends)
    .where(
      and(
        inArray(
          sends.guestId,
          matches.map((row) => row.id),
        ),
        isNotNull(sends.sentAt),
      ),
    )
    .orderBy(desc(sends.sentAt))
    .limit(1);

  return matches.find((row) => row.id === latest?.guestId) ?? matches[0];
}

async function recordInbound(
  message: InboundMessage,
): Promise<{ guest: GuestRow; intent: GuestIntent; at: Date; wamid: string } | null> {
  if (!message.wamid || !message.from) return null;

  const guest = await resolveGuest(message);
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
    return null;
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

  const [row] = await db
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
    .onConflictDoNothing({ target: messageRows.providerMessageId })
    .returning();

  // Nothing inserted means we have seen this wamid before. Acting on it again
  // would confirm an RSVP twice and send a second reply, so stop here.
  if (!row) return null;

  const intent = parseIntent(message);
  await applyIntent(guest, intent, message.timestamp);
  return { guest, intent, at: message.timestamp, wamid: message.wamid };
}

/**
 * The reply, once the acknowledgement is sent. Free-form whenever the window is
 * open — which a button tap always leaves open, and which costs nothing inside
 * a service conversation — and the approved template only as the fallback.
 */
async function respond(
  guest: GuestRow,
  intent: GuestIntent,
  at: Date,
  wamid: string,
): Promise<void> {
  // Anything the button vocabulary does not cover goes to the assistant: a
  // question, or words that mean yes without saying it. Until now this was
  // silence, which is the single worst thing to send someone who wrote to you.
  if (intent === "unknown" || intent === "question") {
    // Before the model runs, not after: the bubble is the answer to "did that
    // even send?", and it is worth nothing once the reply has arrived. It also
    // marks the message read, so the guest sees both at once.
    const config = configFromEnv();
    if (config) await markRead(config, wamid, true);

    const answer = await answerGuest(guest, at);
    if (!answer) return;

    if (answer.text) {
      const outcome = await sendTextToGuest(guest.id, answer.text, "custom");
      if (!outcome.ok) console.error("[whatsapp] assistant reply failed", guest.id, outcome);
    }

    // A guest who says "sí voy" in words is owed exactly what a tapped button
    // earns them. This path used to return here, so someone who cancelled and
    // then changed their mind had their status updated and never received the
    // new pass — the old one stayed revoked and no new one was issued.
    if (answer.confirmed) await deliverConfirmation(guest);
    return;
  }

  const text = await replyFor(guest, intent);
  if (!text) return;

  const kind = isConfirmation(intent) ? "rsvp_confirmation" : "custom";
  const outcome = await sendTextToGuest(guest.id, text, kind);
  if (outcome.ok) {
    // The card follows the confirmation rather than replacing it: the words are
    // the part that must arrive, and an image that fails to upload should never
    // take the confirmation down with it. Declines get nothing — someone who
    // just said they cannot come has no use for the invitation.
    if (isConfirmation(intent)) await deliverConfirmation(guest);
    return;
  }

  if (outcome.reason !== "window_closed") {
    console.error("[whatsapp] reply failed", guest.id, intent, outcome);
    return;
  }

  // The window shut between the guest's tap and this call. Only a confirmation
  // is worth a paid template; a decline can wait for the organizer.
  //
  // `confirmacion_rsvp` is approved and cannot mention a companion, so a
  // plus-one falls back to the plain wording rather than going unanswered.
  if (!isConfirmation(intent)) return;

  const event = await db.query.events.findFirst({ where: eq(events.id, guest.eventId) });
  if (!event) return;

  const fallback = await sendTemplateToGuest(
    guest.id,
    {
      name: "confirmacion_rsvp",
      language: "es_MX",
      components: buildComponents("confirmacion_rsvp", [
        guest.firstName ?? guest.fullName,
        event.name,
        formatEventWhen(event),
        formatEventWhere(event),
      ]),
    },
    "rsvp_confirmation",
  );
  if (!fallback.ok) console.error("[whatsapp] template fallback failed", guest.id, fallback);
}


/**
 * What a confirmation earns: the invitation card, then the pass.
 *
 * One function for both paths on purpose. It lived only in the button branch,
 * and the assistant's branch returned before reaching it — so a guest who
 * confirmed in words got their status changed and nothing else.
 */
async function deliverConfirmation(guest: GuestRow): Promise<void> {
  await sendCard(guest);

  // After the card, never before: the invitation is the message they were
  // waiting for, and a QR arriving first reads like a ticketing system. Re-read
  // so the pass reflects the RSVP that was just written — including a guest who
  // cancelled and came back, whose old codes are revoked and who needs new ones.
  const fresh = await db.query.guests.findFirst({ where: eq(guests.id, guest.id) });
  if (fresh) await sendPasses(fresh);
}

/**
 * The invitation card, if this event has one.
 *
 * Every failure here is silent on purpose. The guest already has their
 * confirmation, and there is no version of "your card could not be sent" worth
 * putting on someone's phone.
 */
async function sendCard(guest: GuestRow): Promise<void> {
  const event = await db.query.events.findFirst({ where: eq(events.id, guest.eventId) });
  if (!event?.cardR2Key) return;

  const mediaId = await resolveCardMediaId(event);
  if (!mediaId) return;

  const outcome = await sendImageToGuest(guest.id, mediaId, "rsvp_confirmation");
  if (!outcome.ok) console.error("[whatsapp] card send failed", guest.id, outcome);
}
