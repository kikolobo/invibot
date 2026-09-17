import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import type { events } from "@/db/schema";
import { eventKindLabels } from "@/lib/events/kinds";
import { CloneEvent } from "./clone-event";
import { UnarchiveButton } from "./unarchive-button";

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * One event in a list. Shared by "Mis eventos" and the archive, which differ
 * only in what the row offers — an archived one can be restored or duplicated,
 * never opened for editing.
 */
export function EventRow({
  event,
  guestCount,
  archived = false,
}: {
  event: typeof events.$inferSelect;
  guestCount: number;
  archived?: boolean;
}) {
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
          {dateFmt.format(new TZDate(event.startsAt, event.timezone))}
          {event.venueName && ` · ${event.venueName}`}
        </p>
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
        {archived && <UnarchiveButton eventId={event.id} />}
        <CloneEvent eventId={event.id} name={event.name} guestCount={guestCount} />
      </div>
    </div>
  );
}
