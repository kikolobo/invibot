import type { PassRequestOutcome } from "@/lib/passes/send";

/**
 * What `send_passes` tells the model, one string per outcome.
 *
 * Shared with the simulator so the rehearsal hears exactly what the real turn
 * would. Each one says what to tell the guest as well as what happened: left
 * to itself, the model apologises for a pass that is simply not due yet, or
 * promises one that will never come.
 */

export const PASSES_SENT =
  "Listo, ya le llegaron sus accesos. Contesta en una frase corta que ahí los tiene para mostrarlos en la entrada; no describas las imágenes.";

export function passesToolResult(outcome: PassRequestOutcome): string {
  if (outcome.ok) return PASSES_SENT;

  switch (outcome.reason) {
    case "too_early":
      return "No se mandó: todavía es pronto. Sus accesos le llegan por aquí automáticamente un día antes del evento. Díselo en una frase, sin disculparte.";
    case "not_confirmed":
      return "No se mandó: no tiene su asistencia confirmada, y los accesos son sólo para quien confirma. Pregúntale si va a asistir; si dice que sí, usa confirm_attendance.";
    case "over":
      return "No se mandó: el evento ya terminó. Díselo con amabilidad.";
    case "disabled":
      return "No se mandó: este evento no usa accesos con QR. Dile que basta con su nombre en la entrada.";
    case "failed":
      return "No se pudo mandar por un problema técnico. Dile que lo intente de nuevo en un momento pidiéndotelo otra vez. No inventes el código.";
  }
}
