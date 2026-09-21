"use server";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, events, guestEvents, guests, messages } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";

/**
 * Everything that ever happened to one guest, in one list.
 *
 * Assembled rather than stored: the facts already live in three places that
 * each exist for their own reason — `guest_events` for the milestones with
 * WhatsApp's own timestamps, `messages` for what was actually said, and the
 * conversation that ties them to a thread. A fourth table holding a copy would
 * be a fourth thing to keep in step.
 *
 * The conversation is folded rather than listed flat. A guest asks three
 * questions and the assistant answers each in two messages; printed one per
 * line that is nine rows of noise, and the thing the organizer wants to see —
 * what they asked and what we told them — is buried in it. So each inbound
 * message keeps its own answers underneath it.
 */

export type TimelineReply = { at: string; text: string };

export type TimelineEntry = {
  at: string;
  /** Who moved: the guest, us, or a milestone worth its own line. */
  kind: "milestone" | "guest" | "us";
  label: string;
  /** What they wrote, for the conversation entries. */
  text?: string;
  /** What we said back, shown indented under the question. */
  replies?: TimelineReply[];
};

/** Long enough to read, short enough that forty of them still fit on a screen. */
const MAX_TEXT = 220;

/**
 * How long after a guest's message one of ours still counts as an answer to it.
 *
 * Past this it stands on its own line: a pass that goes out four hours later is
 * not a reply to "¿dónde es?", and filing it as one would put the QR under a
 * question about parking.
 */
const REPLY_WINDOW_MS = 30 * 60 * 1000;

const MILESTONES: Record<string, string> = {
  self_registered: "Se registró solo",
  approved: "Aprobado por el anfitrión",
  rejected: "Rechazado",
  invited: "Invitación enviada",
  delivered: "Invitación entregada",
  read: "Invitación leída",
  reminded: "Recordatorio enviado",
  confirmed: "Confirmó que asiste",
  declined: "Dijo que no podrá",
  party_size_changed: "Cambió su acompañante",
  opted_out: "Pidió no recibir más mensajes",
};

/** What an outbound message was, when it is not a reply to anything. */
const OUTBOUND_LABELS: { match: RegExp; label: string }[] = [
  { match: /^\[template:invitacion/, label: "Invitación enviada" },
  { match: /^\[template:recordatorio/, label: "Recordatorio enviado" },
  { match: /^\[template:acceso/, label: "Aviso de «es mañana» enviado" },
  { match: /^\[template:aviso_cambio/, label: "Aviso de cambio enviado" },
  { match: /^\[template:confirmacion/, label: "Confirmación enviada" },
  { match: /^\[template:/, label: "Plantilla enviada" },
  { match: /^\[image\]/, label: "Imagen enviada" },
  { match: /^\[location\]/, label: "Ubicación enviada" },
];

const truncate = (text: string) =>
  text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT).trimEnd()}…` : text;

/** One line, so a pasted address does not become twelve rows. */
const flatten = (text: string) => truncate(text.replace(/\s*\n+\s*/g, " · ").trim());

export async function guestTimeline(
  eventId: string,
  guestId: string,
): Promise<{ entries: TimelineEntry[]; error?: string }> {
  const { orgId } = await requireOrg();

  // Ownership is checked against the event, not the guest: a guest id is
  // guessable and this is somebody's phone number and everything they said.
  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.orgId, orgId)),
  });
  if (!event) return { entries: [], error: "No encontramos ese evento." };

  const guest = await db.query.guests.findFirst({
    where: and(eq(guests.id, guestId), eq(guests.eventId, eventId)),
  });
  if (!guest) return { entries: [], error: "No encontramos a esa persona." };

  const history = await db
    .select()
    .from(guestEvents)
    .where(eq(guestEvents.guestId, guestId))
    .orderBy(asc(guestEvents.at));

  const thread = await db
    .select({
      direction: messages.direction,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(conversations.guestId, guestId), eq(conversations.channel, "whatsapp")))
    .orderBy(asc(messages.createdAt));

  const entries: TimelineEntry[] = history.map((row) => ({
    at: row.at.toISOString(),
    kind: "milestone" as const,
    label: milestoneLabel(row),
  }));

  // Walked in order so every outbound message knows which question, if any, it
  // is answering.
  let open: TimelineEntry | null = null;
  let openAt = 0;

  for (const message of thread) {
    const body = (message.body ?? "").trim();
    const at = message.createdAt;

    if (message.direction === "inbound") {
      // A tapped button arrives as its own label — "Sí, asistiré" — which the
      // milestones already say in better words.
      open = {
        at: at.toISOString(),
        kind: "guest",
        label: "Escribió",
        text: flatten(body) || "(sin texto)",
        replies: [],
      };
      openAt = at.getTime();
      entries.push(open);
      continue;
    }

    const labelled = OUTBOUND_LABELS.find((rule) => rule.match.test(body));

    // A template or an image is a thing we did, not an answer — it gets its own
    // line wherever it falls.
    if (labelled) {
      entries.push({ at: at.toISOString(), kind: "us", label: labelled.label });
      continue;
    }

    if (open && at.getTime() - openAt <= REPLY_WINDOW_MS) {
      open.replies!.push({ at: at.toISOString(), text: flatten(body) });
      continue;
    }

    entries.push({
      at: at.toISOString(),
      kind: "us",
      label: "Le escribimos",
      text: flatten(body),
    });
  }

  entries.sort((a, b) => a.at.localeCompare(b.at));

  return { entries };
}

function milestoneLabel(row: typeof guestEvents.$inferSelect): string {
  const base = MILESTONES[row.type] ?? row.type;
  const detail = row.detail as { seats?: number; to?: number; via?: string };

  if (row.type === "confirmed" && detail?.seats) {
    return detail.seats > 1 ? `${base}, con acompañante` : base;
  }
  if (row.type === "party_size_changed" && detail?.to) {
    return `${base}: ahora son ${detail.to}`;
  }
  if (row.type === "reminded" && detail?.via) {
    return `${base} (${detail.via})`;
  }
  // The organizer answering on the guest's behalf is worth saying out loud.
  if (row.source === "organizer" && (row.type === "confirmed" || row.type === "declined")) {
    return `${base} — lo registró el anfitrión`;
  }
  return base;
}
