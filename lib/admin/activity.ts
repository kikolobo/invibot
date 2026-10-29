import { and, desc, eq, inArray, isNotNull, notInArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  adminAudit,
  broadcasts,
  events,
  organizations,
  organizerInvites,
  organizers,
  sessions,
  signIns,
  users,
} from "@/db/schema";
import { auditLabels, type AuditAction } from "./audit";

export type ActivityKind = "sign_in" | "event" | "message" | "team" | "staff";

export type ActivityItem = {
  id: string;
  at: Date;
  kind: ActivityKind;
  text: string;
  /** Where the line is about, when that is a page staff can open. */
  href?: string;
  detail?: string;
};

export const activityLabels: Record<ActivityKind, string> = {
  sign_in: "Acceso",
  event: "Evento",
  message: "Mensaje",
  team: "Equipo",
  staff: "Staff",
};

/** Per source. Merged and cut again below, so the page never holds more than this. */
const LIMIT = 100;

const roleNames: Record<string, string> = {
  admin: "admin",
  guest_manager: "gestor de invitados",
  organizer: "organizador",
};

/** A user agent, shortened to something a person recognises. */
function device(agent: string | null): string | undefined {
  if (!agent) return undefined;
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Chrome\//.test(agent)
      ? "Chrome"
      : /Firefox\//.test(agent)
        ? "Firefox"
        : /Safari\//.test(agent)
          ? "Safari"
          : null;
  const system = /iPhone|iPad/.test(agent)
    ? "iOS"
    : /Android/.test(agent)
      ? "Android"
      : /Mac OS X/.test(agent)
        ? "Mac"
        : /Windows/.test(agent)
          ? "Windows"
          : null;
  return [browser, system].filter(Boolean).join(" en ") || agent.slice(0, 60);
}

/**
 * What an account has done, newest first, pieced together from the tables
 * that already record it. Nothing here is written for the timeline's sake
 * except `sign_ins`; everything else is the product's own data read sideways,
 * so it is only as complete as those tables are. Accepted invitations, for
 * one, are deleted on acceptance and so only pending ones appear.
 */
export async function userActivity(userId: string): Promise<ActivityItem[]> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.ownerUserId, userId),
    columns: { id: true },
  });

  const target = alias(users, "target");
  const actor = alias(users, "actor");

  const [logins, oldSessions, ownEvents, messages, invited, seats, staffOnThem, staffByThem] =
    await Promise.all([
      db
        .select()
        .from(signIns)
        .where(eq(signIns.userId, userId))
        .orderBy(desc(signIns.createdAt))
        .limit(LIMIT),
      // Sessions from before `sign_ins` existed, or whose line failed to write.
      db
        .select({
          id: sessions.id,
          createdAt: sessions.createdAt,
          ipAddress: sessions.ipAddress,
          userAgent: sessions.userAgent,
          impersonatedBy: sessions.impersonatedBy,
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            notInArray(
              sessions.id,
              db
                .select({ id: signIns.sessionId })
                .from(signIns)
                .where(and(eq(signIns.userId, userId), isNotNull(signIns.sessionId))),
            ),
          ),
        )
        .orderBy(desc(sessions.createdAt))
        .limit(LIMIT),
      org
        ? db
            .select({ id: events.id, name: events.name, createdAt: events.createdAt })
            .from(events)
            .where(eq(events.orgId, org.id))
            .orderBy(desc(events.createdAt))
            .limit(LIMIT)
        : Promise.resolve([]),
      db
        .select({
          id: broadcasts.id,
          title: broadcasts.title,
          isTest: broadcasts.isTest,
          createdAt: broadcasts.createdAt,
          sentAt: broadcasts.sentAt,
          retiredAt: broadcasts.retiredAt,
          createdBy: broadcasts.createdByUserId,
          retiredBy: broadcasts.retiredByUserId,
          eventName: events.name,
        })
        .from(broadcasts)
        .innerJoin(events, eq(events.id, broadcasts.eventId))
        .where(or(eq(broadcasts.createdByUserId, userId), eq(broadcasts.retiredByUserId, userId)))
        .orderBy(desc(broadcasts.createdAt))
        .limit(LIMIT),
      db
        .select({
          id: organizerInvites.id,
          fullName: organizerInvites.fullName,
          role: organizerInvites.role,
          createdAt: organizerInvites.createdAt,
          eventName: events.name,
        })
        .from(organizerInvites)
        .innerJoin(events, eq(events.id, organizerInvites.eventId))
        .where(eq(organizerInvites.invitedByUserId, userId))
        .orderBy(desc(organizerInvites.createdAt))
        .limit(LIMIT),
      db
        .select({
          id: organizers.id,
          role: organizers.role,
          createdAt: organizers.createdAt,
          eventName: events.name,
        })
        .from(organizers)
        .innerJoin(events, eq(events.id, organizers.eventId))
        .where(and(eq(organizers.userId, userId), eq(organizers.isOwner, false)))
        .orderBy(desc(organizers.createdAt))
        .limit(LIMIT),
      db
        .select({
          id: adminAudit.id,
          action: adminAudit.action,
          detail: adminAudit.detail,
          createdAt: adminAudit.createdAt,
          actorName: actor.name,
          actorEmail: actor.email,
        })
        .from(adminAudit)
        .leftJoin(actor, eq(actor.id, adminAudit.actorUserId))
        .where(eq(adminAudit.targetUserId, userId))
        .orderBy(desc(adminAudit.createdAt))
        .limit(LIMIT),
      // When the account is staff: what it did to everyone else.
      db
        .select({
          id: adminAudit.id,
          action: adminAudit.action,
          createdAt: adminAudit.createdAt,
          targetUserId: adminAudit.targetUserId,
          targetEmail: adminAudit.targetEmail,
          stillThere: target.id,
        })
        .from(adminAudit)
        .leftJoin(target, eq(target.id, adminAudit.targetUserId))
        .where(eq(adminAudit.actorUserId, userId))
        .orderBy(desc(adminAudit.createdAt))
        .limit(LIMIT),
    ]);

  // Who was "viewing as", by name rather than id.
  const impersonators = [
    ...new Set(
      [...logins, ...oldSessions].map((row) => row.impersonatedBy).filter((id): id is string => !!id),
    ),
  ];
  const names = new Map(
    impersonators.length
      ? (
          await db
            .select({ id: users.id, name: users.name, email: users.email })
            .from(users)
            .where(inArray(users.id, impersonators))
        ).map((row) => [row.id, row.name || row.email])
      : [],
  );

  const signInItem = (row: {
    id: string;
    createdAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
    impersonatedBy: string | null;
  }): ActivityItem => ({
    id: `in:${row.id}`,
    at: row.createdAt,
    kind: row.impersonatedBy ? "staff" : "sign_in",
    text: row.impersonatedBy
      ? `${names.get(row.impersonatedBy) ?? "Staff"} entró como esta cuenta`
      : "Inició sesión",
    detail: [device(row.userAgent), row.ipAddress].filter(Boolean).join(" · ") || undefined,
  });

  const items: ActivityItem[] = [
    ...logins.map(signInItem),
    ...oldSessions.map(signInItem),
    ...ownEvents.map((event) => ({
      id: `ev:${event.id}`,
      at: event.createdAt,
      kind: "event" as const,
      text: `Creó el evento «${event.name}»`,
    })),
    ...messages.flatMap((message) => {
      const test = message.isTest ? " de prueba" : "";
      const lines: ActivityItem[] = [];
      if (message.createdBy === userId) {
        lines.push({
          id: `bc:${message.id}`,
          at: message.createdAt,
          kind: "message",
          text: `Escribió el mensaje${test} «${message.title}»`,
          detail: message.eventName,
        });
        if (message.sentAt) {
          lines.push({
            id: `bs:${message.id}`,
            at: message.sentAt,
            kind: "message",
            text: `Se envió el mensaje${test} «${message.title}»`,
            detail: message.eventName,
          });
        }
      }
      if (message.retiredBy === userId && message.retiredAt) {
        lines.push({
          id: `br:${message.id}`,
          at: message.retiredAt,
          kind: "message",
          text: `Retiró el mensaje «${message.title}»`,
          detail: message.eventName,
        });
      }
      return lines;
    }),
    ...invited.map((invite) => ({
      id: `iv:${invite.id}`,
      at: invite.createdAt,
      kind: "team" as const,
      text: `Invitó a ${invite.fullName} como ${roleNames[invite.role] ?? invite.role}`,
      detail: `«${invite.eventName}» · sin aceptar todavía`,
    })),
    ...seats.map((seat) => ({
      id: `st:${seat.id}`,
      at: seat.createdAt,
      kind: "team" as const,
      text: `Se unió a «${seat.eventName}» como ${roleNames[seat.role] ?? seat.role}`,
    })),
    ...staffOnThem.map((entry) => {
      const reason =
        entry.detail && typeof entry.detail.reason === "string" ? entry.detail.reason : undefined;
      const eventName =
        entry.detail && typeof entry.detail.eventName === "string" ? `«${entry.detail.eventName}»` : undefined;
      return {
        id: `au:${entry.id}`,
        at: entry.createdAt,
        kind: "staff" as const,
        text: `${entry.actorName || entry.actorEmail || "Script"}: ${(auditLabels[entry.action as AuditAction] ?? entry.action).toLowerCase()}`,
        detail: [eventName, reason].filter(Boolean).join(" · ") || undefined,
        href:
          entry.detail && typeof entry.detail.eventId === "string"
            ? `/admin/eventos/${entry.detail.eventId}`
            : undefined,
      };
    }),
    ...staffByThem.map((entry) => ({
      id: `ab:${entry.id}`,
      at: entry.createdAt,
      kind: "staff" as const,
      text: `${auditLabels[entry.action as AuditAction] ?? entry.action}: ${
        entry.action === "settings" ? "sitio" : (entry.targetEmail ?? "cuenta borrada")
      }`,
      href: entry.stillThere ? `/admin/usuarios/${entry.targetUserId}` : undefined,
    })),
  ];

  // Two lines for the same moment read better in a stable order.
  return items
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id))
    .slice(0, LIMIT);
}
