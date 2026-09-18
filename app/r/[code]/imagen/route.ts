import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { r2FromEnv, getObject } from "@/lib/storage/r2";

/**
 * The teaser, served publicly — the one image on an event that is meant to be.
 *
 * No authentication, because an `og:image` is fetched by a crawler that has no
 * session and never will. That is safe only because of what this image is: the
 * organizer is told plainly, at the moment of uploading it, that it appears
 * wherever the link is shared and must not carry the address. The invitation
 * card has its own route and keeps its auth.
 *
 * Reachable only through the event's registration code, and only while
 * registration is open — an event whose link has been turned off stops serving
 * its picture too.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const event = await db.query.events.findFirst({
    where: eq(events.registrationCode, code.toLowerCase()),
  });
  if (!event?.teaserR2Key || !event.autoRegisterEnabled || event.archivedAt) {
    return new Response("Not found", { status: 404 });
  }

  const r2 = r2FromEnv();
  if (!r2) return new Response("Not configured", { status: 503 });

  const bytes = await getObject(r2, event.teaserR2Key);
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(bytes, {
    headers: {
      "content-type": event.teaserContentType ?? "image/jpeg",
      // Public and long-lived: replacing the teaser changes the `v` on the URL
      // in the metadata, so a cached copy is never the wrong picture.
      "cache-control": "public, max-age=86400",
    },
  });
}
