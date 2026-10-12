/**
 * When an event counts as over. `endsAt` when the organizer gave one,
 * otherwise a generous evening — a guest arriving late still needs the code,
 * and a question at midnight is still about tonight.
 */
export const DEFAULT_EVENT_LENGTH_MS = 12 * 60 * 60 * 1000;

export type EventTiming = { startsAt: Date; endsAt: Date | null };

export const eventIsOver = (event: EventTiming, now: number = Date.now()) =>
  now > (event.endsAt?.getTime() ?? event.startsAt.getTime() + DEFAULT_EVENT_LENGTH_MS);
