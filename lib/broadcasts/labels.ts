/**
 * The vocabulary of "Mensajes", with no database import anywhere near it — the
 * composer is a client component, and importing these from a module that
 * reaches for `db` would drag Drizzle into the browser bundle.
 */

/** Who a message goes to. One choice at a time, by design. */
export type AudienceKind =
  | "all"
  | "not_declined"
  | "confirmed"
  | "declined"
  | "no_response"
  | "groups"
  | "guests";

export type Audience =
  | { kind: Exclude<AudienceKind, "groups" | "guests"> }
  | { kind: "groups"; ids: string[] }
  | { kind: "guests"; ids: string[] };

export const audienceLabels: Record<AudienceKind, string> = {
  all: "Todos",
  not_declined: "Todos excepto cancelados",
  confirmed: "Confirmados",
  declined: "Cancelados",
  no_response: "Sin responder",
  groups: "Grupos",
  guests: "Personas específicas",
};

/** The order the composer offers them in. */
export const audienceOrder: AudienceKind[] = [
  "all",
  "not_declined",
  "confirmed",
  "declined",
  "no_response",
  "groups",
  "guests",
];

/**
 * Why somebody in the chosen audience does not get the message. Shown before
 * sending, so nobody is surprised by who was left out.
 */
export type ExclusionReason = "not_invited" | "not_approved" | "opted_out" | "no_phone";

export const exclusionLabels: Record<ExclusionReason, (n: number) => string> = {
  not_invited: (n) =>
    n === 1
      ? "1 invitado no ha recibido su invitación y no será notificado"
      : `${n} invitados no han recibido su invitación y no serán notificados`,
  not_approved: (n) =>
    n === 1 ? "1 persona espera tu aprobación" : `${n} personas esperan tu aprobación`,
  opted_out: (n) =>
    n === 1 ? "1 persona pidió no recibir mensajes" : `${n} personas pidieron no recibir mensajes`,
  no_phone: (n) => (n === 1 ? "1 invitado no tiene teléfono" : `${n} invitados no tienen teléfono`),
};

/**
 * Meta caps a template parameter well above this, but the title is read as
 * one bold line on a phone, and past this it wraps into a paragraph.
 */
export const TITLE_MAX = 60;

/** WhatsApp cuts a message at 4,096 characters; this leaves room for the title. */
export const BODY_MAX = 3000;

/** A draft is saved and never sent until someone sends it from the composer. */
export type BroadcastStatus = "draft" | "scheduled" | "sending" | "sent" | "retired";

export const statusLabels: Record<BroadcastStatus, string> = {
  draft: "Borrador",
  scheduled: "Programado",
  sending: "Enviando",
  sent: "Enviado",
  retired: "Retirado",
};

/** How one person got it. */
export type RecipientRoute = "free" | "template";

/**
 * Where one person's copy ended up. `held` is a template send that never left
 * because Meta has not approved the template yet.
 */
export type RecipientStatus = "sent" | "failed" | "held";

/** The message as it reads once it is open: the title in bold, then the text. */
export function fullMessage(title: string, body: string): string {
  return `*${title.trim()}*\n\n${body.trim()}`;
}
