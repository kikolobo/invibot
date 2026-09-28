import { formatLocalTime, localDayKey } from "@/lib/events/format";

/**
 * When "enviar a las 11:00" actually means.
 *
 * The only clock this app has is the daily cron in `vercel.json` — "0 17 * * *",
 * 17:00 UTC, which is 11:00 in Monterrey — so a scheduled message waits for
 * its next run rather than for a time of the organizer's choosing. Change the
 * cron and this has to change with it.
 */
const CRON_HOUR_UTC = 17;

export function nextCronRun(now = new Date()): Date {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), CRON_HOUR_UTC),
  );
  return now < today ? today : new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * "hoy a las 11:00 a.m." in the event's own zone. An event somewhere else sees
 * its own clock, since that is where the guests will read it.
 */
export function describeRun(at: Date, timezone: string, now = new Date()): string {
  const day = localDayKey(at, timezone);
  const when =
    day === localDayKey(now, timezone)
      ? "hoy"
      : day === localDayKey(now, timezone, 1)
        ? "mañana"
        : new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: timezone }).format(at);
  return `${when} a las ${formatLocalTime(at, timezone)}`;
}
