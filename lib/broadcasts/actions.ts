"use server";

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { broadcasts, organizers, users } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { editableEvent } from "@/lib/events/guard";
import { variantsOf } from "@/lib/phone";
import { sendTemplate, sendText, whatsappConfig } from "@/lib/whatsapp/client";
import { resolveAudience } from "./audience";
import {
  audienceOrder,
  BODY_MAX,
  fullMessage,
  TITLE_MAX,
  type Audience,
  type ExclusionReason,
} from "./labels";
import { nextCronRun } from "./schedule";
import { sendBroadcast } from "./send";
import { TEMPLATE, templateComponents, templateUsable } from "./template";

/**
 * "Mensajes", from the organizer's side.
 *
 * Every action rebuilds what it needs from the database and trusts nothing but
 * ids from the form: which event, which groups, which people. Whether they can
 * be reached, and how, is read fresh every time.
 */

export type Draft = { title: string; body: string };

type Result = { error?: string };

const where = (eventId: string) => `/eventos/${eventId}/mensajes`;

function cleanDraft(
  draft: Draft,
  /** A draft may be half written; only what is sent needs both parts. */
  partial = false,
): { title: string; body: string } | { error: string } {
  // One line: it is a template parameter, and Meta rejects line breaks in those.
  const title = draft.title.replace(/\s+/g, " ").trim();
  const body = draft.body.trim();
  if (partial) {
    if (!title && !body) return { error: "Escribe al menos el título o el mensaje." };
    if (title.length > TITLE_MAX) return { error: `El título puede tener hasta ${TITLE_MAX} caracteres.` };
    if (body.length > BODY_MAX) return { error: `El mensaje puede tener hasta ${BODY_MAX} caracteres.` };
    return { title, body };
  }
  if (!title) return { error: "Falta el título." };
  if (title.length > TITLE_MAX) return { error: `El título puede tener hasta ${TITLE_MAX} caracteres.` };
  if (!body) return { error: "Falta el mensaje." };
  if (body.length > BODY_MAX) return { error: `El mensaje puede tener hasta ${BODY_MAX} caracteres.` };
  return { title, body };
}

function cleanAudience(audience: Audience, partial = false): Audience | { error: string } {
  if (!audienceOrder.includes(audience.kind)) return { error: "Elige a quién se lo mandas." };
  if (audience.kind === "groups" || audience.kind === "guests") {
    const ids = [...new Set(audience.ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (ids.length === 0 && !partial) {
      return {
        error: audience.kind === "groups" ? "Elige al menos un grupo." : "Elige al menos a una persona.",
      };
    }
    return { kind: audience.kind, ids };
  }
  return { kind: audience.kind };
}

export type BroadcastPreview = {
  error?: string;
  /** Everyone it reaches, by name, for the confirmation list. */
  names?: string[];
  /** The whole message, free, right away. */
  free?: number;
  /** The template, with a button for the rest. */
  template?: number;
  /** Would need the template, which Meta has not approved yet. */
  held?: number;
  excluded?: Partial<Record<ExclusionReason, number>>;
  /** The first recipient's name, for the preview bubble. */
  sampleName?: string;
};

/** Who it would reach if it went out now, and how. */
export async function previewBroadcast(
  eventId: string,
  audience: Audience,
): Promise<BroadcastPreview> {
  const guard = await editableEvent(eventId, "message");
  if (!guard.ok) return { error: guard.error };

  const chosen = cleanAudience(audience);
  if ("error" in chosen) return { error: chosen.error };

  const { recipients, excluded } = await resolveAudience(eventId, chosen);
  const config = whatsappConfig();
  const canTemplate = config ? await templateUsable(config) : false;

  const closed = recipients.filter((guest) => !guest.windowOpen).length;
  const first = recipients[0];

  return {
    names: recipients.map((guest) => guest.fullName),
    free: recipients.length - closed,
    template: canTemplate ? closed : 0,
    held: canTemplate ? 0 : closed,
    excluded,
    sampleName: first
      ? first.firstName?.trim() || first.fullName.split(/\s+/)[0]
      : undefined,
  };
}

/**
 * Saves the message and sends it — now, or at the next 11:00 run.
 *
 * With an id, it is a draft or a scheduled message being sent as edited; the
 * same row carries on rather than a copy, so a draft that goes out stops being
 * a draft. Only while it has not left: the cron may have claimed it meanwhile.
 *
 * "Ahora" still goes through the row and the claim in `sendBroadcast`: the
 * page answers at once and the sending carries on after it, so a message to
 * two hundred people does not hold a browser tab open until it finishes.
 */
export async function createBroadcast(
  eventId: string,
  draft: Draft,
  audience: Audience,
  when: "now" | "cron",
  id?: string,
): Promise<Result & { id?: string }> {
  const { userId } = await requireOrg();
  const guard = await editableEvent(eventId, "message");
  if (!guard.ok) return { error: guard.error };

  const clean = cleanDraft(draft);
  if ("error" in clean) return clean;
  const chosen = cleanAudience(audience);
  if ("error" in chosen) return chosen;

  const values = {
    title: clean.title,
    body: clean.body,
    audience: chosen,
    status: "scheduled" as const,
    scheduledFor: when === "cron" ? nextCronRun() : null,
    updatedAt: new Date(),
  };

  const [row] = id
    ? await db
        .update(broadcasts)
        .set(values)
        .where(
          and(
            eq(broadcasts.id, id),
            eq(broadcasts.eventId, eventId),
            eq(broadcasts.isTest, false),
            inArray(broadcasts.status, ["draft", "scheduled"]),
          ),
        )
        .returning({ id: broadcasts.id })
    : await db
        .insert(broadcasts)
        .values({ eventId, ...values, createdByUserId: userId })
        .returning({ id: broadcasts.id });
  if (!row) return { error: "Ese mensaje ya salió; ya no se puede cambiar." };

  if (when === "now") {
    after(async () => {
      try {
        await sendBroadcast(row.id);
      } catch (error) {
        console.error("[mensajes] send now failed", row.id, error);
      }
      revalidatePath(where(eventId));
    });
  }

  revalidatePath(where(eventId));
  return { id: row.id };
}

/**
 * The message on the organizer's own WhatsApp, exactly as a guest with a
 * closed window gets it — the template, then the whole text when they tap.
 *
 * Kept out of the history and the numbers on purpose: it goes straight
 * through the client, never through the ledger. The row exists only so the
 * tap can find the text.
 */
export async function sendTestBroadcast(eventId: string, draft: Draft): Promise<Result & { sentTo?: string }> {
  const { userId, name } = await requireOrg();
  const guard = await editableEvent(eventId, "message");
  if (!guard.ok) return { error: guard.error };

  const clean = cleanDraft(draft);
  if ("error" in clean) return clean;

  const account = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const phone = account?.phone;
  if (!phone) {
    return { error: "Tu cuenta no tiene un WhatsApp registrado. Agrégalo en Mi cuenta para recibir la prueba." };
  }

  const config = whatsappConfig();
  if (!config) return { error: "WhatsApp no está configurado en este entorno." };

  const [test] = await db
    .insert(broadcasts)
    .values({
      eventId,
      title: clean.title,
      body: clean.body,
      audience: { kind: "guests", ids: [] },
      status: "sent",
      isTest: true,
      testPhoneE164: phone,
      createdByUserId: userId,
      sentAt: new Date(),
    })
    .returning({ id: broadcasts.id });

  if (await templateUsable(config)) {
    const result = await sendTemplate(
      config,
      phone,
      TEMPLATE.name,
      TEMPLATE.language,
      templateComponents(test.id, {
        name: (account.name || name || "").split(/\s+/)[0] || "Hola",
        eventName: guard.event.name,
        title: clean.title,
      }),
    );
    if (!result.ok) return { error: `WhatsApp no aceptó la prueba: ${result.title}` };
    return { sentTo: phone };
  }

  // The template is still in review. Their own window may be open — they
  // wrote to the bot as an organizer today — and then the text can go free.
  const [recent] = await db
    .select({ lastInboundAt: organizers.lastInboundAt })
    .from(organizers)
    .where(and(inArray(organizers.phoneE164, variantsOf(phone)), isNotNull(organizers.lastInboundAt)))
    .orderBy(desc(organizers.lastInboundAt))
    .limit(1);
  const open =
    recent?.lastInboundAt && Date.now() - recent.lastInboundAt.getTime() < 23 * 60 * 60 * 1000;
  if (!open) {
    return {
      error:
        "La plantilla sigue en revisión con Meta, así que sólo podemos mandarte la prueba si nos escribiste en las últimas 24 horas. Mándale cualquier mensaje al bot y vuelve a intentarlo.",
    };
  }

  const result = await sendText(config, phone, fullMessage(clean.title, clean.body));
  if (!result.ok) return { error: `WhatsApp no aceptó la prueba: ${result.title}` };
  return { sentTo: phone };
}

/**
 * Saves without sending. New, or over a draft or a scheduled message — which
 * takes the scheduled one out of the queue: a message being reworked should
 * not go out at 11:00 half-changed.
 *
 * Lenient on purpose: a draft may have no text yet, or a group not chosen.
 * Everything is checked again when it is sent.
 */
export async function saveDraft(
  eventId: string,
  draft: Draft,
  audience: Audience,
  id?: string,
): Promise<Result & { id?: string }> {
  const { userId } = await requireOrg();
  const guard = await editableEvent(eventId, "message");
  if (!guard.ok) return { error: guard.error };

  const clean = cleanDraft(draft, true);
  if ("error" in clean) return clean;
  const chosen = cleanAudience(audience, true);
  if ("error" in chosen) return chosen;

  const values = {
    title: clean.title,
    body: clean.body,
    audience: chosen,
    status: "draft" as const,
    scheduledFor: null,
    updatedAt: new Date(),
  };

  const [row] = id
    ? await db
        .update(broadcasts)
        .set(values)
        .where(
          and(
            eq(broadcasts.id, id),
            eq(broadcasts.eventId, eventId),
            eq(broadcasts.isTest, false),
            inArray(broadcasts.status, ["draft", "scheduled"]),
          ),
        )
        .returning({ id: broadcasts.id })
    : await db
        .insert(broadcasts)
        .values({ eventId, ...values, createdByUserId: userId })
        .returning({ id: broadcasts.id });
  if (!row) return { error: "Ese mensaje ya salió; ya no se puede cambiar." };

  revalidatePath(where(eventId));
  return { id: row.id };
}

/**
 * Throws away a draft, or takes a scheduled message out of the queue. Gone
 * entirely — nothing was sent, so there is nothing to keep a record of.
 */
export async function deleteBroadcast(eventId: string, id: string): Promise<Result> {
  const guard = await editableEvent(eventId, "message");
  if (!guard.ok) return { error: guard.error };

  const [row] = await db
    .delete(broadcasts)
    .where(
      and(
        eq(broadcasts.id, id),
        eq(broadcasts.eventId, eventId),
        inArray(broadcasts.status, ["draft", "scheduled"]),
      ),
    )
    .returning({ id: broadcasts.id });
  if (!row) return { error: "Ese mensaje ya salió. Puedes retirarlo en lugar de borrarlo." };

  revalidatePath(where(eventId));
  return {};
}

/**
 * What can be done about a message already on people's phones: stop handing
 * out the rest of it, and stop the assistant from repeating it. It stays in the
 * history with its numbers, marked as retired.
 */
export async function retireBroadcast(eventId: string, id: string): Promise<Result> {
  const { userId } = await requireOrg();
  const guard = await editableEvent(eventId, "message");
  if (!guard.ok) return { error: guard.error };

  const [row] = await db
    .update(broadcasts)
    .set({ status: "retired", retiredAt: new Date(), retiredByUserId: userId, updatedAt: new Date() })
    .where(
      and(
        eq(broadcasts.id, id),
        eq(broadcasts.eventId, eventId),
        inArray(broadcasts.status, ["sent", "sending"]),
      ),
    )
    .returning({ id: broadcasts.id });
  if (!row) return { error: "No encontramos ese mensaje enviado." };

  revalidatePath(where(eventId));
  return {};
}
