import { TZDate } from "@date-fns/tz";

/**
 * Turns a wall-clock date and time in the event's own timezone into the absolute
 * instant we store. "7 PM" means 7 PM where the event happens, regardless of
 * where the organizer is sitting when they type it.
 */
export function zonedToInstant(date: string, time: string, timezone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, timezone).getTime());
}

/** The inverse: the date and time an instant reads as on a wall in `timezone`. */
export function wallClock(instant: Date, timezone: string): { date: string; time: string } {
  const local = new TZDate(instant, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`,
    time: `${pad(local.getHours())}:${pad(local.getMinutes())}`,
  };
}

/**
 * The zones an organizer picks from, labelled by a city they would recognise.
 * Mexico first and in full; elsewhere one per country is close enough, and
 * the few countries that span several get their main ones.
 */
export const timezoneOptions: { value: string; label: string }[] = [
  { value: "America/Mexico_City", label: "Centro de México (CDMX, Guadalajara, Monterrey)" },
  { value: "America/Cancun", label: "Quintana Roo (Cancún)" },
  { value: "America/Mazatlan", label: "Pacífico (Mazatlán, La Paz, Tepic)" },
  { value: "America/Hermosillo", label: "Sonora (Hermosillo)" },
  { value: "America/Tijuana", label: "Baja California (Tijuana, Mexicali)" },
  { value: "America/Chihuahua", label: "Chihuahua" },
  { value: "America/Ciudad_Juarez", label: "Ciudad Juárez" },
  { value: "America/New_York", label: "EE.UU. Este (Nueva York, Miami)" },
  { value: "America/Chicago", label: "EE.UU. Centro (Chicago, Houston)" },
  { value: "America/Denver", label: "EE.UU. Montaña (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "EE.UU. Pacífico (Los Ángeles)" },
  { value: "America/Toronto", label: "Canadá Este (Toronto)" },
  { value: "America/Vancouver", label: "Canadá Pacífico (Vancouver)" },
  { value: "America/Guatemala", label: "Guatemala" },
  { value: "America/Belize", label: "Belice" },
  { value: "America/El_Salvador", label: "El Salvador" },
  { value: "America/Tegucigalpa", label: "Honduras" },
  { value: "America/Managua", label: "Nicaragua" },
  { value: "America/Costa_Rica", label: "Costa Rica" },
  { value: "America/Panama", label: "Panamá" },
  { value: "America/Havana", label: "Cuba" },
  { value: "America/Santo_Domingo", label: "República Dominicana" },
  { value: "America/Puerto_Rico", label: "Puerto Rico" },
  { value: "America/Bogota", label: "Colombia" },
  { value: "America/Caracas", label: "Venezuela" },
  { value: "America/Guayaquil", label: "Ecuador" },
  { value: "America/Lima", label: "Perú" },
  { value: "America/La_Paz", label: "Bolivia" },
  { value: "America/Santiago", label: "Chile" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina" },
  { value: "America/Montevideo", label: "Uruguay" },
  { value: "America/Asuncion", label: "Paraguay" },
  { value: "America/Sao_Paulo", label: "Brasil (São Paulo)" },
  { value: "Europe/Madrid", label: "España" },
  { value: "Europe/Lisbon", label: "Portugal" },
  { value: "Europe/Paris", label: "Francia" },
  { value: "Europe/Rome", label: "Italia" },
  { value: "Europe/London", label: "Reino Unido" },
  { value: "Europe/Berlin", label: "Alemania" },
  { value: "Europe/Amsterdam", label: "Países Bajos" },
  { value: "Europe/Zurich", label: "Suiza" },
  { value: "Europe/Athens", label: "Grecia" },
  { value: "Africa/Casablanca", label: "Marruecos" },
  { value: "Asia/Tokyo", label: "Japón" },
  { value: "Australia/Sydney", label: "Australia (Sídney)" },
];

/** Mexican states off central time. The other twenty-five are on it. */
const stateZones: Record<string, string> = {
  "baja california": "America/Tijuana",
  "baja california sur": "America/Mazatlan",
  sonora: "America/Hermosillo",
  sinaloa: "America/Mazatlan",
  nayarit: "America/Mazatlan",
  chihuahua: "America/Chihuahua",
  "quintana roo": "America/Cancun",
};

/** The usual zone for each country we list; the biggest city where there are several. */
const countryZones: Record<string, string> = {
  MX: "America/Mexico_City",
  US: "America/New_York",
  CA: "America/Toronto",
  GT: "America/Guatemala",
  BZ: "America/Belize",
  SV: "America/El_Salvador",
  HN: "America/Tegucigalpa",
  NI: "America/Managua",
  CR: "America/Costa_Rica",
  PA: "America/Panama",
  CU: "America/Havana",
  DO: "America/Santo_Domingo",
  PR: "America/Puerto_Rico",
  CO: "America/Bogota",
  VE: "America/Caracas",
  EC: "America/Guayaquil",
  PE: "America/Lima",
  BO: "America/La_Paz",
  CL: "America/Santiago",
  AR: "America/Argentina/Buenos_Aires",
  UY: "America/Montevideo",
  PY: "America/Asuncion",
  BR: "America/Sao_Paulo",
  ES: "Europe/Madrid",
  PT: "Europe/Lisbon",
  FR: "Europe/Paris",
  IT: "Europe/Rome",
  GB: "Europe/London",
  DE: "Europe/Berlin",
  NL: "Europe/Amsterdam",
  CH: "Europe/Zurich",
  GR: "Europe/Athens",
  MA: "Africa/Casablanca",
  JP: "Asia/Tokyo",
  AU: "Australia/Sydney",
};

const plain = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

/**
 * Where the venue is, guessed into a zone. A guess the organizer sees and can
 * change — Chihuahua alone has two, and a country we only know by its code
 * gets its capital's.
 */
export function timezoneFor(country: string | null, state: string | null): string {
  if ((country ?? "MX") === "MX" && state) {
    const zone = stateZones[plain(state)];
    if (zone) return zone;
  }
  return countryZones[country ?? "MX"] ?? "America/Mexico_City";
}

export function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
