import { notFound } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, guests, escalations } from "@/db/schema";
import { requireOrg } from "@/lib/auth/session";
import { EventNav } from "./event-nav";

/**
 * Wraps every page of one event so the menu persists while moving between them,
 * and so the ownership check happens once rather than in each child.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireOrg();

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.orgId, orgId)),
  });
  if (!event) notFound();

  const [{ guestCount }] = await db
    .select({ guestCount: count() })
    .from(guests)
    .where(eq(guests.eventId, id));

  const [{ openQuestions }] = await db
    .select({ openQuestions: count() })
    .from(escalations)
    .where(and(eq(escalations.eventId, id), eq(escalations.status, "open")));

  return (
    // Wider than the rest of the app on purpose: these pages carry tables —
    // the guest list and the report — and a column sized for prose made them
    // fight for room that the page had spare.
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 sm:flex-row sm:gap-10 sm:px-8 sm:py-12">
      <EventNav
        eventId={event.id}
        eventName={event.name}
        guestCount={guestCount}
        openQuestions={openQuestions}
        archived={event.archivedAt !== null}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
