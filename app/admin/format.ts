/** Dates on the console are read by staff in Mexico, whatever zone Vercel runs in. */
const dateFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

const dateTimeFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

export const formatDate = (value: Date | string | null) =>
  value ? dateFmt.format(new Date(value)) : "—";

export const formatDateTime = (value: Date | string | null) =>
  value ? dateTimeFmt.format(new Date(value)) : "—";
