import { and, asc, desc, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { broadcastRecipients, broadcasts, events, guests } from "@/db/schema";
import { whatsappConfig, type WhatsAppConfig } from "@/lib/whatsapp/client";
import { sendTemplateToGuest, sendTextToGuest } from "@/lib/whatsapp/send";
import { resolveAudience, type Recipient } from "./audience";
import { fullMessage } from "./labels";
import { TEMPLATE, templateComponents, templateUsable } from "./template";

type BroadcastRow = typeof broadcasts.$inferSelect;
type EventRow = typeof events.$inferSelect;

/**
 * Sending a message, and handing over the rest of it when somebody asks.
 *
 * Each person gets exactly one of two things: the whole message, free, when
 * their window is open; or the template with the title and a [Leer mensaje]
 * button, which is paid, when it is not. The tap opens their window, and the
 * whole message follows free.
 */

/** Parallel, but gently: these can be paid messages against a tiered limit. */
const WORKERS = 5;

/** What the template calls them: "Hola María", not the full name off the list. */
const greeting = (guest: { firstName: string | null; fullName: string }) =>
  guest.firstName?.trim() || guest.fullName.split(/\s+/)[0] || guest.fullName;

/**
 * Sends one message to its audience, as the audience stands right now.
 *
 * Claimed before anything goes out, so a double press, a second tab, or the
 * cron overlapping an "enviar ahora" cannot send it twice.
 */
export async function sendBroadcast(broadcastId: string, now = new Date()): Promise<number> {
  const [claimed] = await db
    .update(broadcasts)
    .set({ status: "sending", startedAt: now, updatedAt: now })
    .where(
      and(
        eq(broadcasts.id, broadcastId),
        eq(broadcasts.status, "scheduled"),
        eq(broadcasts.isTest, false),
      ),
    )
    .returning();
  if (!claimed) return 0;

  const event = await db.query.events.findFirst({ where: eq(events.id, claimed.eventId) });
  if (!event) return 0;

  const { recipients, excluded } = await resolveAudience(event.id, claimed.audience, now);
  await db.update(broadcasts).set({ excluded }).where(eq(broadcasts.id, claimed.id));

  const config = whatsappConfig();
  const canTemplate = config ? await templateUsable(config) : false;

  const queue = [...recipients];
  let sent = 0;
  const worker = async () => {
    for (let guest = queue.shift(); guest; guest = queue.shift()) {
      try {
        if (await reach(claimed, event, guest, canTemplate)) sent++;
      } catch (error) {
        console.error("[mensajes] send failed", claimed.id, guest.id, error);
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));

  await db
    .update(broadcasts)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(broadcasts.id, claimed.id), eq(broadcasts.status, "sending")));

  return sent;
}

/**
 * One person's copy. The whole message if their window is open; otherwise the
 * template, or — while Meta is still reviewing it — nothing yet, recorded as
 * held so the cron can send it once the template is approved.
 */
async function reach(
  broadcast: BroadcastRow,
  event: EventRow,
  guest: Recipient,
  canTemplate: boolean,
): Promise<boolean> {
  if (guest.windowOpen) {
    const outcome = await sendTextToGuest(
      guest.id,
      fullMessage(broadcast.title, broadcast.body),
      "custom",
    );
    if (outcome.ok) {
      await record(broadcast.id, guest.id, {
        route: "free",
        status: "sent",
        sendId: outcome.sendId,
        // They have the whole thing: there is nothing left to ask for.
        openedAt: new Date(),
      });
      return true;
    }
    // Only a window that shut in the last minutes is worth a second route.
    if (outcome.reason !== "window_closed") {
      await record(broadcast.id, guest.id, {
        route: "free",
        status: "failed",
        sendId: outcome.sendId,
        error: outcome.detail,
      });
      return false;
    }
  }

  if (!canTemplate) {
    await record(broadcast.id, guest.id, { route: "template", status: "held" });
    return false;
  }

  return sendTemplateCopy(broadcast, event, guest);
}

async function sendTemplateCopy(
  broadcast: BroadcastRow,
  event: EventRow,
  guest: Pick<Recipient, "id" | "fullName" | "firstName">,
): Promise<boolean> {
  const outcome = await sendTemplateToGuest(
    guest.id,
    {
      name: TEMPLATE.name,
      language: TEMPLATE.language,
      components: templateComponents(broadcast.id, {
        name: greeting(guest),
        eventName: event.name,
        title: broadcast.title,
      }),
    },
    "custom",
  );

  await record(broadcast.id, guest.id, {
    route: "template",
    status: outcome.ok ? "sent" : "failed",
    sendId: outcome.sendId,
    error: outcome.ok ? null : outcome.detail,
  });
  return outcome.ok;
}

/**
 * Written once per person, updated if they were held and are now sent. The
 * unique key is what makes a sweep that runs twice harmless.
 */
async function record(
  broadcastId: string,
  guestId: string,
  values: Omit<typeof broadcastRecipients.$inferInsert, "broadcastId" | "guestId">,
) {
  await db
    .insert(broadcastRecipients)
    .values({ broadcastId, guestId, ...values })
    .onConflictDoUpdate({
      target: [broadcastRecipients.broadcastId, broadcastRecipients.guestId],
      set: values,
    });
}

/**
 * The 11:00 run: everything scheduled for it, then everyone held back while
 * the template was in review.
 */
export async function sendDueBroadcasts(now = new Date()): Promise<number> {
  const due = await db
    .select({ id: broadcasts.id })
    .from(broadcasts)
    .innerJoin(events, eq(events.id, broadcasts.eventId))
    .where(
      and(
        eq(broadcasts.status, "scheduled"),
        eq(broadcasts.isTest, false),
        lte(broadcasts.scheduledFor, now),
        isNull(events.archivedAt),
      ),
    )
    .orderBy(asc(broadcasts.scheduledFor));

  let sent = 0;
  for (const { id } of due) sent += await sendBroadcast(id, now);
  return sent + (await releaseHeld());
}

/**
 * The people a message could not reach while Meta reviewed the template.
 *
 * Only for messages still worth reading: not retired, and for an event that
 * has not happened yet. A held message about Saturday's party arriving on
 * Sunday is worse than none.
 */
export async function releaseHeld(now = new Date()): Promise<number> {
  const config = whatsappConfig();
  if (!config || !(await templateUsable(config))) return 0;

  const held = await db
    .select({
      broadcast: broadcasts,
      event: events,
      guest: { id: guests.id, fullName: guests.fullName, firstName: guests.firstName },
    })
    .from(broadcastRecipients)
    .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
    .innerJoin(events, eq(events.id, broadcasts.eventId))
    .innerJoin(guests, eq(guests.id, broadcastRecipients.guestId))
    .where(
      and(
        eq(broadcastRecipients.status, "held"),
        isNull(broadcasts.retiredAt),
        isNull(events.archivedAt),
        gt(events.startsAt, now),
      ),
    );

  let sent = 0;
  for (const row of held) {
    try {
      if (await sendTemplateCopy(row.broadcast, row.event, row.guest)) sent++;
    } catch (error) {
      console.error("[mensajes] held send failed", row.broadcast.id, row.guest.id, error);
    }
  }
  return sent;
}

export type PendingOutcome =
  /** Sent this many, oldest first. */
  | { kind: "sent"; count: number }
  /** They asked for a message that has since been retired, and nothing else waits. */
  | { kind: "retired" }
  /** Nothing to send: they have everything already, or never got a message. */
  | { kind: "none" };

/**
 * Everything a guest was told about and has not read yet, now that they asked.
 *
 * A tap names the message it came from; if they already have everything else,
 * that one is sent again rather than answered with silence — asking twice is
 * still asking. A retired message is never sent, even to someone who taps it.
 */
export async function deliverPendingMessages(
  guestId: string,
  config?: WhatsAppConfig,
  tappedId?: string | null,
): Promise<PendingOutcome> {
  const pending = await db
    .select({ recipient: broadcastRecipients, broadcast: broadcasts })
    .from(broadcastRecipients)
    .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
    .where(
      and(
        eq(broadcastRecipients.guestId, guestId),
        eq(broadcastRecipients.route, "template"),
        eq(broadcastRecipients.status, "sent"),
        isNull(broadcastRecipients.openedAt),
        isNull(broadcasts.retiredAt),
      ),
    )
    .orderBy(asc(broadcasts.sentAt));

  let rows = pending;
  if (rows.length === 0 && tappedId) {
    const again = await db
      .select({ recipient: broadcastRecipients, broadcast: broadcasts })
      .from(broadcastRecipients)
      .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
      .where(
        and(eq(broadcastRecipients.guestId, guestId), eq(broadcastRecipients.broadcastId, tappedId)),
      );
    if (again[0]?.broadcast.retiredAt) return { kind: "retired" };
    rows = again;
  }
  if (rows.length === 0) return { kind: "none" };

  let count = 0;
  for (const { recipient, broadcast } of rows) {
    const outcome = await sendTextToGuest(
      guestId,
      fullMessage(broadcast.title, broadcast.body),
      "custom",
      config,
    );
    if (!outcome.ok) {
      console.error("[mensajes] full message not sent", broadcast.id, guestId, outcome.detail);
      continue;
    }
    count++;
    await db
      .update(broadcastRecipients)
      .set({ openedAt: recipient.openedAt ?? new Date(), fullSendId: outcome.sendId })
      .where(eq(broadcastRecipients.id, recipient.id));
  }

  return count > 0 ? { kind: "sent", count } : { kind: "none" };
}

/**
 * The messages this guest was sent and that still stand, newest first — what
 * the assistant is told, so it can answer "¿a qué hora dijeron que empieza?".
 * Retired ones are left out: the organizer took them back.
 */
export async function messagesForGuest(guestId: string) {
  return db
    .select({
      id: broadcasts.id,
      title: broadcasts.title,
      body: broadcasts.body,
      sentAt: broadcasts.sentAt,
      opened: broadcastRecipients.openedAt,
    })
    .from(broadcastRecipients)
    .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
    .where(
      and(
        eq(broadcastRecipients.guestId, guestId),
        inArray(broadcastRecipients.status, ["sent"]),
        isNull(broadcasts.retiredAt),
      ),
    )
    .orderBy(desc(broadcasts.sentAt))
    .limit(10);
}
