/**
 * Una sola vez: preguntarle su acompañante a quien confirmó con +1 antes de que
 * existiera el campo.
 *
 *   npx tsx scripts/ask-companion-names.mts             # ensayo, no manda nada
 *   npx tsx scripts/ask-companion-names.mts --apply     # manda
 *
 * A partir de ahora el asistente lo pregunta solo al confirmar, así que esto no
 * es una función: es el barrido de los que quedaron atrás. Por eso vive en
 * `scripts/` y se corre a mano.
 *
 * A quién SÍ:
 *   confirmó, con dos lugares, sin nombre de acompañante, aprobado, sin baja,
 *   evento no archivado y todavía por venir, invitación entregada, y **con la
 *   ventana de 24 horas abierta** — este mensaje es libre y fuera de la ventana
 *   no hay plantilla que lo cargue, ni vale una.
 *
 * Y sólo entre las 11:00 y las 20:00 en la zona del evento, como el resto de lo
 * que mandamos sin que nadie lo haya pedido.
 *
 * Quien contesta el nombre lo guarda el asistente (`set_companion_name`), así
 * que deja de cumplir el filtro y una segunda corrida no lo vuelve a molestar.
 * Quien no contesta sí volvería a salir: esto se corre una vez.
 */
process.loadEnvFile(".env.local");

// Importado en caliente, como los demás scripts: el alias `@/` sólo resuelve
// después de que tsx está en marcha, y la conexión no debe abrirse antes de
// que `.env.local` esté cargado.
const { and, eq, gt, isNull, sql: raw } = await import("drizzle-orm");
const { db } = await import("../db/index");
const { conversations, events, guests } = await import("../db/schema");
const { localHour } = await import("../lib/events/format");
const { sendTextToGuest } = await import("../lib/whatsapp/send");

const apply = process.argv.includes("--apply");

/** Las mismas horas que usa el recordatorio de confirmación. */
const DESDE = 11;
const HASTA = 20;

/** Margen para que la ventana no se cierre entre la consulta y el envío. */
const MARGEN_MS = 15 * 60 * 1000;

const now = new Date();

const candidates = await db
  .select({ guest: guests, event: events, windowExpiresAt: conversations.windowExpiresAt })
  .from(guests)
  .innerJoin(events, eq(events.id, guests.eventId))
  .innerJoin(
    conversations,
    and(eq(conversations.guestId, guests.id), eq(conversations.channel, "whatsapp")),
  )
  .where(
    and(
      eq(guests.rsvpStatus, "confirmed"),
      eq(guests.approvalStatus, "approved"),
      eq(guests.optedOut, false),
      raw`coalesce(${guests.partySizeConfirmed}, 1) >= 2`,
      raw`${guests.companions} = '[]'::jsonb`,
      isNull(events.archivedAt),
      gt(events.startsAt, now),
      gt(conversations.windowExpiresAt, new Date(now.getTime() + MARGEN_MS)),
    ),
  );

const asked: string[] = [];
const skipped: string[] = [];

for (const { guest, event } of candidates) {
  const hour = localHour(now, event.timezone);
  if (hour < DESDE || hour >= HASTA) {
    skipped.push(`${guest.fullName} — fuera de horario (${hour}:00 en ${event.timezone})`);
    continue;
  }

  const name = guest.firstName?.trim() || guest.fullName.split(/\s+/)[0] || guest.fullName;
  const text = [
    `Hola ${name} 👋`,
    "",
    `Estoy armando la lista de ${event.name} y me falta un dato: ¿cómo se llama la persona que te acompaña?`,
    "",
    "Con su nombre completo la anoto en la lista de la entrada.",
  ].join("\n");

  if (!apply) {
    asked.push(`${guest.fullName} → ${event.name}`);
    continue;
  }

  const outcome = await sendTextToGuest(guest.id, text, "custom");
  if (outcome.ok) asked.push(`${guest.fullName} → ${event.name}`);
  else skipped.push(`${guest.fullName} — ${outcome.reason}: ${outcome.detail}`);
}

console.log(`${candidates.length} con ventana abierta`);
console.log(`${apply ? "preguntado a" : "se preguntaría a"} ${asked.length}:`);
for (const line of asked) console.log(`  · ${line}`);
if (skipped.length > 0) {
  console.log(`sin mandar ${skipped.length}:`);
  for (const line of skipped) console.log(`  · ${line}`);
}
if (!apply) console.log("\nEnsayo. Nada se mandó; agrega --apply.");

process.exit(0);
