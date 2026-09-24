import { can, eventAccess } from "@/lib/events/access";
import { r2FromEnv, getObject } from "@/lib/storage/r2";

/**
 * The organizer's own preview of the card they uploaded.
 *
 * Exists because the bucket is private and deliberately has no public URL. Every
 * request is checked against the signed-in organization, so the only way to see
 * a card is to own the event it belongs to.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const access = await eventAccess(id);
  const event = access && can(access, "guests") ? access.event : null;
  if (!event?.cardR2Key) return new Response("Not found", { status: 404 });

  const r2 = r2FromEnv();
  if (!r2) return new Response("Not configured", { status: 503 });

  const bytes = await getObject(r2, event.cardR2Key);
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(bytes, {
    headers: {
      "content-type": event.cardContentType ?? "image/jpeg",
      // Private: this is one organization's invitation, not a public asset.
      "cache-control": "private, max-age=60",
    },
  });
}
