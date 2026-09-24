"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reportPresets } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { editableEvent } from "@/lib/events/guard";

/**
 * However the organizer last left the report.
 *
 * Kept server-side rather than in the browser so it follows them to another
 * machine, and per user rather than per event because two people sharing an
 * event read it differently — one prints a door list, the other a seating
 * chart.
 */

const KEYS = ["filtro", "orden", "dir", "agrupar", "campos"] as const;

/** Only the parameters this page owns, so nothing else rides along into storage. */
function clean(params: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of KEYS) {
    const value = params[key];
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export async function loadReportPreset(
  eventId: string,
): Promise<Record<string, string> | null> {
  const { userId } = await requireOrg();

  const row = await db.query.reportPresets.findFirst({
    where: and(
      eq(reportPresets.userId, userId),
      eq(reportPresets.eventId, eventId),
      isNull(reportPresets.name),
    ),
  });

  return row?.params ?? null;
}

/**
 * Remembers the current view. Never fails a page over a preference — this runs
 * from the client after a navigation and the report is already on screen.
 */
export async function saveReportPreset(
  eventId: string,
  params: Record<string, string>,
): Promise<void> {
  try {
    const { userId } = await requireOrg();

    // Archived events are still readable, so this is an ownership check rather
    // than an edit guard — but a preference is not worth writing for an event
    // the caller cannot see.
    const guard = await editableEvent(eventId, "guests");
    if (!guard.ok && guard.error !== undefined) {
      const owns = await db.query.reportPresets.findFirst({
        where: and(eq(reportPresets.userId, userId), eq(reportPresets.eventId, eventId)),
      });
      if (!owns) return;
    }

    await db
      .insert(reportPresets)
      .values({ userId, eventId, name: null, params: clean(params) })
      .onConflictDoUpdate({
        target: [reportPresets.userId, reportPresets.eventId, reportPresets.name],
        set: { params: clean(params), updatedAt: new Date() },
      });
  } catch (error) {
    console.error("[report] could not remember the view", eventId, error);
  }
}
