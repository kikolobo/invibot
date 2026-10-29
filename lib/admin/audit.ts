import { db } from "@/db";
import { adminAudit } from "@/db/schema";

export type AuditAction =
  | "create"
  | "update"
  | "set_role"
  | "set_password"
  | "suspend"
  | "unsuspend"
  | "delete"
  | "restore"
  | "purge"
  | "revoke_sessions"
  | "impersonate"
  | "set_limits"
  | "suspend_event"
  | "unsuspend_event"
  | "event_limit"
  | "settings"
  | "billing_exempt"
  | "gift_slots"
  | "promo_create"
  | "promo_toggle"
  | "connector"
  | "payment_manual"
  | "payment_refund"
  | "payment_cancel";

export const auditLabels: Record<AuditAction, string> = {
  create: "Creó la cuenta",
  update: "Editó los datos",
  set_role: "Cambió el rol",
  set_password: "Cambió la contraseña",
  suspend: "Suspendió",
  unsuspend: "Reactivó",
  delete: "Eliminó",
  restore: "Restauró",
  purge: "Borró definitivamente",
  revoke_sessions: "Cerró sus sesiones",
  impersonate: "Entró como esta cuenta",
  set_limits: "Cambió los límites",
  suspend_event: "Suspendió un evento",
  unsuspend_event: "Reactivó un evento",
  event_limit: "Cambió el límite de un evento",
  settings: "Cambió la configuración",
  billing_exempt: "Cambió la cortesía",
  gift_slots: "Regaló lugares",
  promo_create: "Creó un código de cortesía",
  promo_toggle: "Cambió un código de cortesía",
  connector: "Cambió un conector",
  payment_manual: "Registró un pago manual",
  payment_refund: "Reembolsó un pago",
  payment_cancel: "Canceló un pago",
};

/**
 * One line in the log. Written after the change succeeds, never instead of it:
 * a log entry for something that did not happen is worse than no entry.
 *
 * A failure to write it is logged and swallowed. By then the change is made,
 * and telling staff it failed would have them do it twice.
 */
export async function audit(entry: {
  actorUserId: string | null;
  /** The account it was done to — for an event, its owner; null for site settings. */
  target: { id: string; email: string } | null;
  action: AuditAction;
  detail?: Record<string, unknown>;
}) {
  try {
    await db.insert(adminAudit).values({
      actorUserId: entry.actorUserId,
      targetUserId: entry.target?.id ?? null,
      targetEmail: entry.target?.email ?? null,
      action: entry.action,
      detail: entry.detail ?? null,
    });
  } catch (error) {
    console.error("[admin] could not write audit line", entry, error);
  }
}
