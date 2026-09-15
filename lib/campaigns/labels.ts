/**
 * The vocabulary the invitation UI shows, with no database import anywhere near
 * it — `recipients.ts` reaches for `db`, and a client component that imported
 * these from there would drag Drizzle and the connection string into the
 * browser bundle.
 */

export type SkipReason =
  | "no_phone"
  | "opted_out"
  | "suppressed"
  | "already_invited"
  | "in_flight";

export const skipLabels: Record<SkipReason, string> = {
  no_phone: "Sin teléfono",
  opted_out: "Pidió no recibir mensajes",
  suppressed: "En la lista de bajas",
  already_invited: "Ya tiene su invitación",
  in_flight: "Enviándose ahora",
};

export type MissingField = "hostNames" | "venue";

export const missingLabels: Record<MissingField, string> = {
  hostNames: "quién invita",
  venue: "el lugar",
};

/** How the guest list shows how far an invitation got. */
export const inviteLabels: Record<string, string> = {
  pending: "Sin enviar",
  queued: "Enviando…",
  sent: "Enviada",
  delivered: "Entregada",
  read: "Leída",
  failed: "Falló",
};
