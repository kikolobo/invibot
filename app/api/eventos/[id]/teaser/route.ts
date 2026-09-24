import { can, eventAccess } from "@/lib/events/access";
import { r2FromEnv, getObject } from "@/lib/storage/r2";

/**
 * The organizer's preview of their "Save the Date" teaser.
 *
 * Authenticated like the card's, even though the teaser is destined to be
 * public: it is not public *yet*. Nothing links to it, and an image an
 * organizer uploaded and then thought better of should not be sitting at a
 * readable URL in the meantime. The public route arrives with the link
 * preview that needs it.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const access = await eventAccess(id);
  const event = access && can(access, "guests") ? access.event : null;
  if (!event?.teaserR2Key) return new Response("Not found", { status: 404 });

  const r2 = r2FromEnv();
  if (!r2) return new Response("Not configured", { status: 503 });

  const bytes = await getObject(r2, event.teaserR2Key);
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(bytes, {
    headers: {
      "content-type": event.teaserContentType ?? "image/jpeg",
      "cache-control": "private, max-age=60",
    },
  });
}
