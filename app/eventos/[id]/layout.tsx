import { notFound } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { guests, escalations } from "@/db/schema";
import { can, eventAccess, roleLabels } from "@/lib/events/access";
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
  const access = await eventAccess(id);
  if (!access) notFound();
  const { event } = access;

  // The badge counts guests, so it counts approved ones: someone who registered
  // themselves is not on the list until the host says so.
  const [{ guestCount }] = await db
    .select({ guestCount: count() })
    .from(guests)
    .where(and(eq(guests.eventId, id), eq(guests.approvalStatus, "approved")));

  const [{ pendingCount }] = await db
    .select({ pendingCount: count() })
    .from(guests)
    .where(and(eq(guests.eventId, id), eq(guests.approvalStatus, "pending")));

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
        pendingCount={pendingCount}
        openQuestions={openQuestions}
        archived={event.archivedAt !== null}
        can={{
          event: can(access, "event"),
          answer: can(access, "answer"),
          team: can(access, "team"),
        }}
        roleLabel={access.role === "owner" ? null : roleLabels[access.role]}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
