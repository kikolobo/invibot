import type { events } from "@/db/schema";
import type { EventDetails } from "@/lib/events/details";
import { eventWeather, type EventWeather, type HourReading } from "@/lib/weather/forecast";

type EventRow = typeof events.$inferSelect;

/**
 * What `get_weather` tells the model — the numbers, and exactly how it may use
 * them.
 *
 * The wording rules live here rather than in the system prompt because they
 * depend on the reading: a ten-year average must be said as "suele", a forecast
 * as "se pronostica", and an indoor party needs no advice at all. Giving the
 * model the raw numbers and a general rule is how "suele" turns into a
 * forecast.
 *
 * Two rules are the organizer's and never bend. Rain is only mentioned when the
 * guest asked about it, and nothing is said about what happens to the event if
 * it rains unless the answer is good news — a covered area. Postponing or
 * cancelling is the host's to announce, and a bot hinting at it changes who
 * shows up.
 */

/** A chance of rain at or above this, in any hour of the party, counts as "indica lluvia". */
const RAIN_LIKELY = 50;

/** Past a week a forecast is a trend, and should be worded as one. */
const FORECAST_FIRM_DAYS = 7;

const round = (n: number) => Math.round(n);

function feel(temp: number): string {
  if (temp >= 30) return "calor";
  if (temp >= 24) return "cálido";
  if (temp >= 18) return "templado";
  if (temp >= 12) return "fresco";
  return "frío";
}

function extreme(hours: HourReading[], pick: (a: number, b: number) => boolean): HourReading {
  return hours.reduce((best, h) => (pick(h.temp, best.temp) ? h : best));
}

export function weatherToolResult(
  weather: EventWeather | null,
  details: Pick<EventDetails, "setting" | "rainPolicy">,
): string {
  if (!weather) {
    return "No se pudo consultar el clima. Dile en una frase que por ahora no tienes esa información. No lo escales al anfitrión.";
  }

  const { hours } = weather;
  const first = hours[0];
  const last = hours.at(-1)!;
  const high = extreme(hours, (a, b) => a > b);
  const low = extreme(hours, (a, b) => a < b);
  const coldestFeel = Math.min(...hours.map((h) => h.feelsLike));
  const indoor = details.setting === "indoor";

  const lines: string[] = [];

  if (weather.kind === "typical") {
    lines.push(
      "TODAVÍA NO HAY PRONÓSTICO para esa fecha: falta más de dos semanas.",
      `Esto es cómo suele estar el clima a esas horas, en esas fechas, en ese lugar (promedio de ${weather.years} años). NO es un pronóstico.`,
    );
  } else {
    lines.push(
      weather.daysAway > FORECAST_FIRM_DAYS
        ? `Pronóstico a ${weather.daysAway} días: todavía puede cambiar bastante, trátalo como tendencia.`
        : `Pronóstico para las horas del evento (faltan ${weather.daysAway} días).`,
    );
  }

  lines.push(
    `- Al empezar (${first.hour}): aprox. ${round(first.temp)} °C, ${feel(first.temp)}`,
    `- Lo más caluroso: aprox. ${round(high.temp)} °C hacia las ${high.hour}`,
    `- Lo más fresco: aprox. ${round(low.temp)} °C hacia las ${low.hour}`,
    `- Al terminar (${last.hour}): aprox. ${round(last.temp)} °C, ${feel(last.temp)}`,
  );

  const rainy =
    weather.kind === "forecast"
      ? hours.filter((h) => (h.rainChance ?? 0) >= RAIN_LIKELY)
      : [];

  lines.push("", "Cómo contestarlo, en una o dos frases:");
  if (indoor) {
    lines.push(
      "- EL EVENTO ES EN INTERIORES. Empieza por decírselo con esas palabras («el evento es en interiores»): es lo que más le sirve. Luego, si quieres, la temperatura afuera en una frase corta. No des consejos de ropa por el clima.",
    );
  }

  if (weather.kind === "typical") {
    lines.push(
      "- Empieza diciendo que todavía no hay pronóstico para esa fecha, y luego cómo suele estar, con «suele» o «suelen»: por ejemplo «todavía no hay un pronóstico, pero en esas fechas las tardes suelen ser templadas y refresca en la noche». Nunca digas «se pronostica».",
    );
  } else {
    lines.push("- Di las temperaturas redondeadas y con «aprox.». Describe cómo cambia durante el evento, no hora por hora.");
  }

  if (!indoor) {
    const advice: string[] = [];
    if (coldestFeel < 12) advice.push("llevar una chamarra para cuando refresque");
    else if (coldestFeel < 18) advice.push("llevar un sweater o algo ligero para cuando refresque");
    if (high.temp >= 30) advice.push("ropa fresca y tomar agua");
    if (advice.length > 0) lines.push(`- Puedes sugerirle ${advice.join(", y ")}.`);
  }

  lines.push("- Si NO te preguntó por lluvia, no menciones la lluvia.");
  if (indoor) {
    lines.push("- Si preguntó por lluvia: recuérdale que el evento es en interiores.");
  } else if (weather.kind === "typical") {
    lines.push("- Si preguntó por lluvia: dile que todavía no hay pronóstico para esa fecha. No digas si suele llover o no.");
  } else if (rainy.length > 0) {
    lines.push(
      `- Si preguntó por lluvia: dile que no tienes datos meteorológicos precisos y no puedes darle un pronóstico exacto, pero que por ahora el pronóstico indica lluvia (hacia las ${rainy[0].hour}).`,
    );
    if (details.rainPolicy === "covered") {
      lines.push("- Y en ese caso menciónale que el lugar tiene un área techada.");
    }
  } else {
    lines.push(
      "- Si preguntó por lluvia: dile que no tienes datos meteorológicos precisos y no puedes darle un pronóstico exacto, pero que por ahora el pronóstico no indica lluvia.",
    );
  }

  lines.push(
    "- Nunca digas qué pasa con el evento si llueve — si se pospone, se cancela o se hace igual —, aunque esté entre las respuestas del anfitrión. Eso lo comunica el anfitrión. No escales preguntas del clima.",
  );

  return lines.join("\n");
}

/** The tool, end to end: the event's hours at the venue, worded for the model. */
export async function weatherReportFor(event: EventRow): Promise<string> {
  if (!event.venueLat || !event.venueLng) {
    return "No tenemos la ubicación exacta del lugar, así que no hay clima que consultar. Dile en una frase que por ahora no tienes esa información. No lo escales al anfitrión.";
  }
  const weather = await eventWeather({
    lat: event.venueLat,
    lng: event.venueLng,
    timezone: event.timezone,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  });
  return weatherToolResult(weather, event.details);
}
