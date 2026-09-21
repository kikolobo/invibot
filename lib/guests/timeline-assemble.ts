import type { guestEvents } from "@/db/schema";

/**
 * Turning one guest's rows into the list the panel renders.
 *
 * Kept apart from `timeline.ts` because that file is `"use server"`, where
 * every export has to be an async server action — and because this half is
 * pure, which is the half worth running against real rows without a session.
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

/**
 * How far apart a milestone and the message that caused it can be and still be
 * the same thing. They are written in the same breath, so this is generous.
 */
const SAME_EVENT_MS = 5 * 60 * 1000;

/** Two passes in a row, or any label repeated back to back, collapse into one. */
const COLLAPSE_MS = 10 * 60 * 1000;

/**
 * What an outbound message was.
 *
 * Read off the `sends` ledger rather than guessed from the text: the ledger
 * already knows the kind and the template, which is the difference between
 * "Imagen enviada" and "Tarjeta de invitación enviada". Null means it is
 * ordinary talk — an answer to something, and it belongs under the question.
 */
function outboundLabel(
  send: { kind: string | null; templateName: string | null } | null,
  body: string,
): { label: string; milestone?: string } | null {
  const template = send?.templateName ?? "";

  if (template.startsWith("invitacion_actualizada")) {
    return { label: "Invitación actualizada enviada", milestone: "invited" };
  }
  if (template.startsWith("invitacion")) {
    return { label: "Invitación enviada", milestone: "invited" };
  }
  if (template.startsWith("recordatorio")) {
    return { label: "Recordatorio enviado (plantilla)", milestone: "reminded" };
  }
  if (template.startsWith("acceso")) return { label: "Aviso de «es mañana» enviado" };
  if (template.startsWith("aviso_cambio")) return { label: "Aviso de cambio enviado" };
  if (template.startsWith("confirmacion")) return { label: "Confirmación enviada" };
  if (template) return { label: "Plantilla enviada" };

  // Free-form, so the kind is what says which of our messages this was.
  if (send?.kind === "reminder") {
    return { label: "Recordatorio enviado (botones)", milestone: "reminded" };
  }
  if (body.startsWith("[image]")) {
    return send?.kind === "rsvp_confirmation"
      ? { label: "Tarjeta de invitación enviada" }
      : { label: "Imagen enviada" };
  }
  if (body.startsWith("[location]")) return { label: "Ubicación enviada" };
  if (send?.kind === "logistics" && body.includes("acceso")) {
    return { label: "Acceso (QR) enviado" };
  }
  if (send?.kind === "auto_register" && /save the date/i.test(body)) {
    return { label: "Save the Date enviado" };
  }
  // The organizer's answer, arriving cold hours after the question.
  if (/^(Ya tengo respuesta|Sobre lo que preguntaste|Una corrección)/.test(body)) {
    return { label: "Respuesta del anfitrión enviada" };
  }

  return null;
}

const truncate = (text: string) =>
  text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT).trimEnd()}…` : text;

/** One line, so a pasted address does not become twelve rows. */
const flatten = (text: string) => truncate(text.replace(/\s*\n+\s*/g, " · ").trim());

export type HistoryRow = typeof guestEvents.$inferSelect;

export type ThreadRow = {
  direction: string;
  body: string | null;
  createdAt: Date;
  kind: string | null;
  templateName: string | null;
};

/** The whole assembly: milestones, then the conversation folded into it. */
export function buildTimeline(history: HistoryRow[], thread: ThreadRow[]): TimelineEntry[] {
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

    const labelled = outboundLabel(
      { kind: message.kind, templateName: message.templateName },
      body,
    );

    // A template or an image is a thing we did, not an answer — it gets its own
    // line wherever it falls, unless a milestone already says it. The
    // invitation used to appear twice for exactly that reason: once as
    // `invited` and once as the template that carried it.
    if (labelled) {
      const covered =
        labelled.milestone &&
        history.some(
          (row) =>
            row.type === labelled.milestone &&
            Math.abs(row.at.getTime() - at.getTime()) <= SAME_EVENT_MS,
        );
      if (!covered) entries.push({ at: at.toISOString(), kind: "us", label: labelled.label });
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

  return collapse(entries);
}

/**
 * Folds a label repeated back to back into one line.
 *
 * A guest with a companion gets two passes, one message each, seconds apart.
 * Two identical rows read as a bug; "Acceso (QR) enviado ×2" reads as what
 * happened.
 */
function collapse(entries: TimelineEntry[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  let run = 1;

  for (const entry of entries) {
    const last = out[out.length - 1];
    const same =
      last &&
      last.kind === "us" &&
      entry.kind === "us" &&
      !last.text &&
      !entry.text &&
      last.label.replace(/ ×\d+$/, "") === entry.label &&
      new Date(entry.at).getTime() - new Date(last.at).getTime() <= COLLAPSE_MS;

    if (same) {
      run++;
      last.label = `${entry.label} ×${run}`;
      continue;
    }

    run = 1;
    out.push({ ...entry });
  }

  return out;
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
    return detail.via === "libre" ? `${base} (botones)` : `${base} (plantilla)`;
  }
  // The organizer answering on the guest's behalf is worth saying out loud.
  if (row.source === "organizer" && (row.type === "confirmed" || row.type === "declined")) {
    return `${base} — lo registró el anfitrión`;
  }
  return base;
}
