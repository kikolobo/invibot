/**
 * What the weather will be like during an event, from Open-Meteo.
 *
 * Two answers, depending on how far away the party is. Inside the forecast
 * horizon (about 15 days) it is the hourly forecast for the event's own hours.
 * Past it no forecast exists yet, and the honest answer is what those hours are
 * usually like: the same local hours, a few days either side of the date, over
 * the last ten years of reanalysis. The two are kept apart in the type because
 * they must never be worded the same way — a ten-year average said as "se
 * pronostica" is an invented forecast.
 *
 * Open-Meteo's free tier is for non-commercial use. No key; requests are
 * cached per event so a burst of guests asking the same thing costs one call.
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

/** Guests ask about the whole party, not the moment it starts. */
const DEFAULT_DURATION_HOURS = 7;
const MAX_DURATION_HOURS = 12;

/** Ten years is enough to average out one odd autumn without reaching into a different climate. */
const TYPICAL_YEARS = 10;
/** Days either side of the date, so one freak evening does not become "suele". */
const TYPICAL_SPREAD_DAYS = 3;

export type HourReading = {
  /** Local wall-clock hour at the venue, "19:00". */
  hour: string;
  temp: number;
  feelsLike: number;
  /** Forecast only; a ten-year average has no meaningful chance of rain. */
  rainChance?: number;
};

export type EventWeather =
  | { kind: "forecast"; daysAway: number; hours: HourReading[] }
  | { kind: "typical"; years: number; hours: HourReading[] };

export type WeatherQuery = {
  lat: number;
  lng: number;
  timezone: string;
  startsAt: Date;
  endsAt: Date | null;
};

/** One hour of the event, as a calendar date and hour at the venue. */
type Slot = { date: string; hour: number };

const cache = new Map<string, { at: number; value: EventWeather | null }>();
const FORECAST_TTL_MS = 3 * 60 * 60 * 1000;
const TYPICAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function eventWeather(
  query: WeatherQuery,
  now = new Date(),
): Promise<EventWeather | null> {
  const key = [query.lat, query.lng, query.timezone, +query.startsAt, +(query.endsAt ?? 0)].join("|");
  const hit = cache.get(key);
  if (hit) {
    const ttl = hit.value?.kind === "typical" ? TYPICAL_TTL_MS : FORECAST_TTL_MS;
    if (+now - hit.at < ttl) return hit.value;
  }

  const slots = eventSlots(query);
  const value = (await forecast(query, slots, now)) ?? (await typical(query, slots));
  // A failure is not cached: the next guest should get another try.
  if (value) cache.set(key, { at: +now, value });
  return value;
}

/** Every local hour the event covers, start rounded down and end rounded up. */
function eventSlots(query: WeatherQuery): Slot[] {
  const start = +query.startsAt;
  const requested = query.endsAt ? +query.endsAt : start + DEFAULT_DURATION_HOURS * 3_600_000;
  const end = Math.min(Math.max(requested, start), start + MAX_DURATION_HOURS * 3_600_000);

  const slots: Slot[] = [];
  const seen = new Set<string>();
  for (let t = start - (start % 3_600_000); t <= end; t += 3_600_000) {
    const slot = localSlot(new Date(t), query.timezone);
    const id = `${slot.date}T${slot.hour}`;
    // A DST fall-back repeats an hour; one reading of it is plenty.
    if (!seen.has(id)) {
      seen.add(id);
      slots.push(slot);
    }
  }
  return slots;
}

function localSlot(at: Date, timeZone: string): Slot {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const slotKey = (date: string, hour: number) => `${date}T${String(hour).padStart(2, "0")}:00`;
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** Calendar arithmetic on "YYYY-MM-DD", free of any timezone. */
function shiftDate(date: string, { years = 0, days = 0 }: { years?: number; days?: number }): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y + years, m - 1, d + days)).toISOString().slice(0, 10);
}

type Hourly = { time: string[]; temperature_2m: number[]; apparent_temperature: number[]; precipitation_probability?: number[] };

async function fetchHourly(
  base: string,
  query: WeatherQuery,
  from: string,
  to: string,
  variables: string[],
): Promise<Hourly | null> {
  const url = new URL(base);
  url.searchParams.set("latitude", String(query.lat));
  url.searchParams.set("longitude", String(query.lng));
  url.searchParams.set("timezone", query.timezone);
  url.searchParams.set("start_date", from);
  url.searchParams.set("end_date", to);
  url.searchParams.set("hourly", variables.join(","));
  try {
    let response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    // Ten archive years go out at once, and the free tier sometimes turns one
    // or two away — which quietly shrinks the average rather than failing it.
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    }
    const body = await response.json();
    // Out of the forecast horizon comes back as a 400 with a reason; that is
    // the signal to fall back to the typical weather, not a failure.
    if (!response.ok || body.error) {
      if (response.status !== 400) console.error("[weather] refused", response.status, body.reason);
      return null;
    }
    return body.hourly as Hourly;
  } catch (error) {
    console.error("[weather] request failed", base, error);
    return null;
  }
}

async function forecast(query: WeatherQuery, slots: Slot[], now: Date): Promise<EventWeather | null> {
  const hourly = await fetchHourly(FORECAST_URL, query, slots[0].date, slots.at(-1)!.date, [
    "temperature_2m",
    "apparent_temperature",
    "precipitation_probability",
  ]);
  if (!hourly) return null;

  const index = new Map(hourly.time.map((time, i) => [time, i]));
  const hours: HourReading[] = [];
  for (const slot of slots) {
    const i = index.get(slotKey(slot.date, slot.hour));
    if (i === undefined || hourly.temperature_2m[i] == null) continue;
    hours.push({
      hour: hourLabel(slot.hour),
      temp: hourly.temperature_2m[i],
      feelsLike: hourly.apparent_temperature[i],
      rainChance: hourly.precipitation_probability?.[i] ?? undefined,
    });
  }
  if (hours.length === 0) return null;

  const daysAway = Math.max(0, Math.round((+new Date(slots[0].date) - +new Date(localSlot(now, query.timezone).date)) / 86_400_000));
  return { kind: "forecast", daysAway, hours };
}

async function typical(query: WeatherQuery, slots: Slot[]): Promise<EventWeather | null> {
  const first = slots[0].date;
  // Which calendar day of the event each slot falls on — a party that runs
  // past midnight has hours on two dates.
  const offsets = slots.map((slot) => ({
    days: Math.round((+new Date(slot.date) - +new Date(first)) / 86_400_000),
    hour: slot.hour,
  }));
  const lastOffset = offsets.at(-1)!.days;

  const years = Array.from({ length: TYPICAL_YEARS }, (_, i) => i + 1);
  const samples = await Promise.all(
    years.map(async (back) => {
      const base = shiftDate(first, { years: -back });
      const hourly = await fetchHourly(
        ARCHIVE_URL,
        query,
        shiftDate(base, { days: -TYPICAL_SPREAD_DAYS }),
        shiftDate(base, { days: TYPICAL_SPREAD_DAYS + lastOffset }),
        ["temperature_2m", "apparent_temperature"],
      );
      return hourly ? { base, hourly } : null;
    }),
  );

  const sums = offsets.map(() => ({ temp: 0, feelsLike: 0, n: 0 }));
  let usedYears = 0;
  for (const sample of samples) {
    if (!sample) continue;
    usedYears++;
    const index = new Map(sample.hourly.time.map((time, i) => [time, i]));
    for (let spread = -TYPICAL_SPREAD_DAYS; spread <= TYPICAL_SPREAD_DAYS; spread++) {
      offsets.forEach((offset, s) => {
        const date = shiftDate(sample.base, { days: spread + offset.days });
        const i = index.get(slotKey(date, offset.hour));
        const temp = i === undefined ? null : sample.hourly.temperature_2m[i];
        if (i === undefined || temp == null) return;
        sums[s].temp += temp;
        sums[s].feelsLike += sample.hourly.apparent_temperature[i];
        sums[s].n++;
      });
    }
  }
  if (usedYears === 0) return null;

  const hours = offsets.flatMap((offset, s) =>
    sums[s].n === 0
      ? []
      : [{ hour: hourLabel(offset.hour), temp: sums[s].temp / sums[s].n, feelsLike: sums[s].feelsLike / sums[s].n }],
  );
  return hours.length > 0 ? { kind: "typical", years: usedYears, hours } : null;
}
