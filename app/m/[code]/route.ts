import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eventMapsUrl } from "@/lib/events/maps";

/**
 * The short link in every invitation: /m/{code} → Google Maps.
 *
 * It exists so the message reads `invibot.com/m/ab12cd` instead of eighty
 * characters of percent-encoded address. The indirection also means an
 * organizer who corrects the venue fixes every invitation already sent —
 * the link in the guest's thread now points at the new place.
 *
 * No auth: it is handed out to guests by definition, and it discloses only the
 * address that invitation already carried.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  const event = await db.query.events.findFirst({
    where: eq(events.mapsCode, code.toLowerCase()),
  });

  const destination = event ? eventMapsUrl(event) : null;
  if (!destination) return new NextResponse("No encontramos ese lugar.", { status: 404 });

  // 302, not 301: browsers cache a permanent redirect forever, and the venue
  // can still change.
  return NextResponse.redirect(destination, 302);
}
