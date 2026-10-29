import type { SiteSettings } from "@/lib/site/settings";

/**
 * How the price is explained, wherever it is explained — the landing page
 * and an event's payment page say the same thing in the same words, and the
 * number always comes from the admin's settings.
 */

/** What one guest's place pays for. */
export const included = [
  "Su invitación por WhatsApp",
  "Su confirmación, con acompañantes",
  "Los recordatorios antes del evento",
  "Su pase con código QR",
  "Las respuestas de Aura a sus dudas, a cualquier hora",
];

/** What never costs anything. */
export const free = [
  "Crear tus eventos",
  "Armar la lista de invitados",
  "Diseñar tu invitación",
  "La liga de autorregistro",
  "Probar a Aura en el simulador",
];

export const methods = "Tarjeta, OXXO o transferencia SPEI";

export function priceLabels(settings: Pick<SiteSettings, "pricePerGuestMinor" | "currency" | "minimumSlots">) {
  const format = (minor: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: settings.currency,
      // $10, not $10.00 — but $12.50 keeps its cents.
      minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    }).format(minor / 100);
  return {
    perGuest: format(settings.pricePerGuestMinor),
    /** The example everyone asks about: a typical wedding. */
    example: { guests: 150, total: format(settings.pricePerGuestMinor * 150) },
    minimum: `${settings.minimumSlots} invitados`,
    minimumTotal: format(settings.pricePerGuestMinor * settings.minimumSlots),
    currency: settings.currency,
  };
}
