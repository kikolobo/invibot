import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { broadcastRecipients, broadcasts, guestGroups, guests, sends, users } from "@/db/schema";
import { requireEventAccess } from "@/lib/events/access";
import { describeRun, nextCronRun } from "@/lib/broadcasts/schedule";
import { audienceLabels, type Audience } from "@/lib/broadcasts/labels";
import { resolveAudience } from "@/lib/broadcasts/audience";
import { MensajesTabs } from "./mensajes-tabs";
import type { BroadcastView, RecipientView } from "./broadcast-card";

export const metadata = { title: "Mensajes" };

/**
 * "Enviar ahora" answers at once and keeps sending after the response, and
 * that tail runs under this page's limit — Server Actions take the page's.
 */
export const maxDuration = 300;

/**
 * Messages to the guests beyond the invitation: writing one, and everything
 * that was sent, with how far each one got.
 */
export default async function Mensajes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await requireEventAccess(id, "message");
  const archived = event.archivedAt !== null;

  const groups = await db
    .select({ id: guestGroups.id, name: guestGroups.name })
    .from(guestGroups)
    .where(eq(guestGroups.eventId, id))
    .orderBy(asc(guestGroups.sortOrder), asc(guestGroups.name));

  // How many each group can reach, counted by the same rules as the send.
  const reachable = await resolveAudience(id, { kind: "all" });
  const reachByGroup = new Map<string, number>();
  for (const guest of reachable.recipients) {
    if (guest.groupId) reachByGroup.set(guest.groupId, (reachByGroup.get(guest.groupId) ?? 0) + 1);
  }

  const people = await db
    .select({ id: guests.id, fullName: guests.fullName, groupName: guestGroups.name })
    .from(guests)
    .leftJoin(guestGroups, eq(guestGroups.id, guests.groupId))
    .where(and(eq(guests.eventId, id), eq(guests.approvalStatus, "approved")))
    .orderBy(asc(guests.fullName));

  const rows = await db
    .select({
      broadcast: broadcasts,
      author: users.name,
      total: sql<number>`count(${broadcastRecipients.id})::int`,
      free: sql<number>`count(*) filter (where ${broadcastRecipients.route} = 'free')::int`,
      template: sql<number>`count(*) filter (where ${broadcastRecipients.route} = 'template' and ${broadcastRecipients.status} <> 'held')::int`,
      held: sql<number>`count(*) filter (where ${broadcastRecipients.status} = 'held')::int`,
      failed: sql<number>`count(*) filter (where ${broadcastRecipients.status} = 'failed' or ${sends.status} = 'failed')::int`,
      delivered: sql<number>`count(*) filter (where ${sends.status} in ('delivered', 'read'))::int`,
      read: sql<number>`count(*) filter (where ${sends.status} = 'read')::int`,
      // A template recipient opens it by asking for the rest; someone who got
      // it whole has opened it once WhatsApp says they read it.
      opened: sql<number>`count(*) filter (where
        (${broadcastRecipients.route} = 'template' and ${broadcastRecipients.openedAt} is not null)
        or (${broadcastRecipients.route} = 'free' and ${sends.status} = 'read'))::int`,
    })
    .from(broadcasts)
    .leftJoin(users, eq(users.id, broadcasts.createdByUserId))
    .leftJoin(broadcastRecipients, eq(broadcastRecipients.broadcastId, broadcasts.id))
    .leftJoin(sends, eq(sends.id, broadcastRecipients.sendId))
    .where(and(eq(broadcasts.eventId, id), eq(broadcasts.isTest, false)))
    .groupBy(broadcasts.id, users.name)
    .orderBy(desc(broadcasts.createdAt));

  const ids = rows.map((row) => row.broadcast.id);
  const recipientRows =
    ids.length === 0
      ? []
      : await db
          .select({
            broadcastId: broadcastRecipients.broadcastId,
            name: guests.fullName,
            route: broadcastRecipients.route,
            status: broadcastRecipients.status,
            sendStatus: sends.status,
            opened: broadcastRecipients.openedAt,
            error: broadcastRecipients.error,
          })
          .from(broadcastRecipients)
          .innerJoin(guests, eq(guests.id, broadcastRecipients.guestId))
          .leftJoin(sends, eq(sends.id, broadcastRecipients.sendId))
          .where(inArray(broadcastRecipients.broadcastId, ids))
          .orderBy(asc(guests.fullName));

  const byBroadcast = new Map<string, RecipientView[]>();
  for (const row of recipientRows) {
    const list = byBroadcast.get(row.broadcastId) ?? [];
    list.push({
      name: row.name,
      route: row.route,
      status: row.status,
      sendStatus: row.sendStatus,
      opened: row.opened !== null,
      error: row.error,
    });
    byBroadcast.set(row.broadcastId, list);
  }

  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const personNames = new Map(people.map((person) => [person.id, person.fullName]));

  const describeAudience = (audience: Audience): string => {
    if ((audience.kind === "groups" || audience.kind === "guests") && audience.ids.length === 0) {
      return `${audienceLabels[audience.kind]}: sin elegir`;
    }
    if (audience.kind === "groups") {
      const names = audience.ids.map((gid) => groupNames.get(gid) ?? "grupo borrado");
      return `${names.length === 1 ? "Grupo" : "Grupos"}: ${names.join(", ")}`;
    }
    if (audience.kind === "guests") {
      const names = audience.ids.map((gid) => personNames.get(gid)).filter(Boolean);
      return names.length <= 3
        ? names.join(", ")
        : `${names.slice(0, 3).join(", ")} y ${names.length - 3} más`;
    }
    return audienceLabels[audience.kind];
  };

  const now = new Date();
  const dateTime = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timezone,
  });

  const views: BroadcastView[] = rows.map((row) => ({
    id: row.broadcast.id,
    audienceValue: row.broadcast.audience,
    title: row.broadcast.title,
    body: row.broadcast.body,
    status: row.broadcast.status,
    audience: describeAudience(row.broadcast.audience),
    author: row.author,
    when:
      row.broadcast.status === "draft"
        ? `Guardado el ${dateTime.format(row.broadcast.updatedAt)}`
        : row.broadcast.status === "scheduled"
          ? row.broadcast.scheduledFor
            ? `Se envía ${describeRun(row.broadcast.scheduledFor, event.timezone, now)}`
            : "Enviándose…"
          : row.broadcast.sentAt
            ? `Enviado el ${dateTime.format(row.broadcast.sentAt)}`
            : "Enviándose…",
    excluded: row.broadcast.excluded,
    stats: {
      total: row.total,
      free: row.free,
      template: row.template,
      held: row.held,
      failed: row.failed,
      delivered: row.delivered,
      read: row.read,
      opened: row.opened,
    },
    recipients: byBroadcast.get(row.broadcast.id) ?? [],
  }));

  return (
    <div>
      <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">Mensajes</h1>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
        Avisos para tus invitados por WhatsApp. A quien tiene la conversación abierta le llega
        completo; a los demás les llega el título con un botón para leer el resto.
      </p>

      <MensajesTabs
        eventId={event.id}
        views={views}
        editable={!archived}
        composer={
          archived
            ? null
            : {
                eventId: event.id,
                eventName: event.name,
                cronLabel: describeRun(nextCronRun(now), event.timezone, now),
                groups: groups.map((group) => ({ ...group, reach: reachByGroup.get(group.id) ?? 0 })),
                people: people.map((person) => ({
                  id: person.id,
                  name: person.fullName,
                  group: person.groupName,
                })),
              }
        }
      />
    </div>
  );
}
