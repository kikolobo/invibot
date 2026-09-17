import { notFound } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, guests } from "@/db/schema";
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

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10 sm:flex-row sm:gap-12 sm:px-10 sm:py-12">
      <EventNav
        eventId={event.id}
        eventName={event.name}
        guestCount={guestCount}
        archived={event.archivedAt !== null}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
