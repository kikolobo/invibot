import Link from "next/link";
import type { events } from "@/db/schema";
import { eventKindLabels } from "@/lib/events/kinds";
import { roleLabels, type EventRole } from "@/lib/events/access";
import { CloneEvent } from "./clone-event";
import { UnarchiveButton } from "./unarchive-button";

// Built per render with the event's own timeZone. Without that option Intl
// formats in the runtime's zone, which on Vercel is UTC — the same bug that
// told guests a Saturday-night party was on Sunday.
const dateFmtFor = (timeZone: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone });

/**
 * One event in a list. Shared by "Mis eventos" and the archive, which differ
 * only in what the row offers — an archived one can be restored or duplicated,
 * never opened for editing.
 */
export function EventRow({
  event,
  guestCount,
  role,
  archived = false,
}: {
  event: typeof events.$inferSelect;
  guestCount: number;
  role: EventRole;
  archived?: boolean;
}) {
  // Restoring and copying change what the event is; a guest manager does not.
  const manages = role !== "guest_manager";

  return (
    <div
      className={`rounded-xl border p-5 transition-colors ${
        archived
          ? "border-line/70 bg-transparent hover:border-line"
          : "border-line bg-paper-deep hover:border-accent"
      }`}
    >
      <Link href={`/eventos/${event.id}`} className="block">
        <div className="flex items-baseline justify-between gap-4">
          <h2
            className={`font-display text-xl ${archived ? "text-ink-soft" : "text-ink"}`}
          >
            {event.name}
          </h2>
          <span className="eyebrow shrink-0">{eventKindLabels[event.kind].es}</span>
        </div>
        <p className="mt-1 text-[0.9rem] text-ink-soft">
          {dateFmtFor(event.timezone).format(event.startsAt)}
          {event.venueName && ` · ${event.venueName}`}
        </p>
        {role !== "owner" && (
          <p className="mt-2 text-[0.78rem] text-ink-muted">
            Compartido contigo · {roleLabels[role]}
          </p>
        )}
      </Link>
      {manages && (
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
          {archived && <UnarchiveButton eventId={event.id} />}
          <CloneEvent eventId={event.id} name={event.name} guestCount={guestCount} />
        </div>
      )}
    </div>
  );
}
