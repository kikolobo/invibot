import { and, eq, isNull, gt, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { escalations, events, guests, organizers } from "@/db/schema";
import { whatsappConfig, sendText, sendTemplate, type WhatsAppConfig } from "@/lib/whatsapp/client";
import { buildComponents } from "@/lib/whatsapp/templates";
import { sends } from "@/db/schema";

type EventRow = typeof events.$inferSelect;
type OrganizerRow = typeof organizers.$inferSelect;

/**
 * El corte diario que reciben los organizadores.
 *
 * Nació de una pregunta que se hace todos los días a mano: ¿pasó algo desde
 * ayer? La app lo contesta con seis números, y esto los pone en su teléfono sin
 * que tengan que abrirla.
 *
 * Las últimas 24 horas las decide Postgres, en la misma consulta que los
 * totales: dos relojes para un mismo mensaje es como se producen reportes que
 * no cuadran consigo mismos.
 *
 * Hoy sale con el cron de las 11:00, que es el único que el plan permite. Con
 * un cron propio se mueve a las 22:00, que es la hora a la que un anfitrión
 * quiere el resumen del día — y entonces esto no cambia, sólo quién lo llama.
 */

export type DailyReport = {
  eventName: string;
  confirmedNew: number;
  confirmedTotal: number;
  seatsNew: number;
  seatsTotal: number;
  selfNew: number;
  pendingApproval: number;
  declinedNew: number;
  declinedTotal: number;
  questionsNew: number;
  questionsOpen: number;
};

export async function reportFor(event: EventRow): Promise<DailyReport> {
  const day = raw`now() - interval '24 hours'`;
  const seats = raw`coalesce(${guests.partySizeConfirmed}, 1)`;

  const [counts] = await db
    .select({
      // Aprobados: quien todavía espera decisión no está en la lista, y
      // contarlo como confirmado sería mentir dos veces.
      confirmedTotal: raw<number>`count(*) filter (
        where ${guests.approvalStatus} = 'approved' and ${guests.rsvpStatus} = 'confirmed')::int`,
      confirmedNew: raw<number>`count(*) filter (
        where ${guests.approvalStatus} = 'approved' and ${guests.rsvpStatus} = 'confirmed'
        and ${guests.rsvpRespondedAt} > ${day})::int`,
      seatsTotal: raw<number>`coalesce(sum(${seats}) filter (
        where ${guests.approvalStatus} = 'approved' and ${guests.rsvpStatus} = 'confirmed'), 0)::int`,
      seatsNew: raw<number>`coalesce(sum(${seats}) filter (
        where ${guests.approvalStatus} = 'approved' and ${guests.rsvpStatus} = 'confirmed'
        and ${guests.rsvpRespondedAt} > ${day}), 0)::int`,
      declinedTotal: raw<number>`count(*) filter (
        where ${guests.approvalStatus} = 'approved' and ${guests.rsvpStatus} = 'declined')::int`,
      declinedNew: raw<number>`count(*) filter (
        where ${guests.approvalStatus} = 'approved' and ${guests.rsvpStatus} = 'declined'
        and ${guests.rsvpRespondedAt} > ${day})::int`,
      // Los auto-registros nuevos se cuentan al llegar, no al aprobarse: es lo
      // que le dice al anfitrión que su liga está circulando.
      selfNew: raw<number>`count(*) filter (
        where ${guests.source} = 'self' and ${guests.createdAt} > ${day})::int`,
      pendingApproval: raw<number>`count(*) filter (where ${guests.approvalStatus} = 'pending')::int`,
    })
    .from(guests)
    .where(eq(guests.eventId, event.id));

  const [questions] = await db
    .select({
      questionsNew: raw<number>`count(*) filter (where ${escalations.createdAt} > ${day})::int`,
      questionsOpen: raw<number>`count(*) filter (where ${escalations.status} = 'open')::int`,
    })
    .from(escalations)
    .where(eq(escalations.eventId, event.id));

  return {
    eventName: event.name,
    confirmedNew: counts?.confirmedNew ?? 0,
    confirmedTotal: counts?.confirmedTotal ?? 0,
    seatsNew: counts?.seatsNew ?? 0,
    seatsTotal: counts?.seatsTotal ?? 0,
    selfNew: counts?.selfNew ?? 0,
    pendingApproval: counts?.pendingApproval ?? 0,
    declinedNew: counts?.declinedNew ?? 0,
    declinedTotal: counts?.declinedTotal ?? 0,
    questionsNew: questions?.questionsNew ?? 0,
    questionsOpen: questions?.questionsOpen ?? 0,
  };
}

/** Las cinco líneas del reporte, que son también los cinco parámetros de la plantilla. */
export function reportLines(report: DailyReport): string[] {
  const pair = (nuevos: number, total: number, totalWord: string) =>
    `${nuevos} ${nuevos === 1 ? "nuevo" : "nuevos"} · ${total} ${totalWord}`;

  return [
    pair(report.confirmedNew, report.confirmedTotal, "en total"),
    pair(report.seatsNew, report.seatsTotal, "en total"),
    `${report.selfNew} ${report.selfNew === 1 ? "nuevo" : "nuevos"} · ${report.pendingApproval} por aprobar`,
    pair(report.declinedNew, report.declinedTotal, "en total"),
    `${report.questionsNew} ${report.questionsNew === 1 ? "nueva" : "nuevas"} · ${report.questionsOpen} sin responder`,
  ];
}

/**
 * El reporte como se lee en el teléfono.
 *
 * El mismo texto que la plantilla, para que pedirlo con /reporte y recibirlo
 * solo a las 11 no se vean como dos cosas distintas.
 */
export function formatReport(report: DailyReport): string {
  const [confirmados, lugares, registros, cancelados, preguntas] = reportLines(report);

  return [
    `Corte de ${report.eventName} · últimas 24 horas`,
    "",
    `✅ Confirmados: ${confirmados}`,
    `🎟️ Lugares: ${lugares}`,
    `🙋 Auto-registros: ${registros}`,
    `❌ Cancelados: ${cancelados}`,
    `❓ Preguntas: ${preguntas}`,
  ].join("\n");
}

/** Los eventos que todavía merecen un reporte: vivos y por suceder. */
async function reportableEvents(): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(isNull(events.archivedAt), gt(events.startsAt, new Date())));
}

const windowOpenFor = (organizer: OrganizerRow, now: Date) => {
  const last = organizer.lastInboundAt?.getTime();
  return Boolean(last && now.getTime() - last < 24 * 60 * 60 * 1000);
};

/**
 * Manda el corte a cada organizador de cada evento por venir.
 *
 * Gratis para quien nos escribió en las últimas 24 horas — que es el caso
 * común, porque leer el reporte y contestar algo abre la ventana del día
 * siguiente — y con la plantilla `reporte_diario` para los demás.
 */
export async function sendDailyReports(now = new Date()): Promise<number> {
  const config = whatsappConfig();
  if (!config) return 0;

  let sent = 0;
  for (const event of await reportableEvents()) {
    const crew = await db
      .select()
      .from(organizers)
      .where(eq(organizers.eventId, event.id));
    if (crew.length === 0) continue;

    const report = await reportFor(event);

    for (const organizer of crew) {
      try {
        if (await deliver(event, organizer, report, config, now)) sent++;
      } catch (error) {
        console.error("[reporte] falló", event.id, organizer.id, error);
      }
    }
  }

  return sent;
}

async function deliver(
  event: EventRow,
  organizer: OrganizerRow,
  report: DailyReport,
  config: WhatsAppConfig,
  now: Date,
): Promise<boolean> {
  const open = windowOpenFor(organizer, now);

  const result = open
    ? await sendText(config, organizer.phoneE164, formatReport(report))
    : await sendTemplate(
        config,
        organizer.phoneE164,
        "reporte_diario",
        "es_MX",
        buildComponents("reporte_diario", [event.name, ...reportLines(report)]),
      );

  await db.insert(sends).values({
    eventId: event.id,
    guestId: null,
    channel: "whatsapp",
    kind: "organizer_relay",
    templateName: open ? null : "reporte_diario",
    templateLanguage: open ? null : "es_MX",
    status: result.ok ? "sent" : "failed",
    providerMessageId: result.ok ? result.messageId : null,
    sentAt: result.ok ? new Date() : null,
    errorCode: result.ok ? null : result.code,
    errorTitle: result.ok ? null : result.title,
  });

  if (!result.ok) console.error("[reporte] no salió", organizer.id, result.title);
  return result.ok;
}
