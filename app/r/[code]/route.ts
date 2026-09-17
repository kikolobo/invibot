import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { whatsappRegistrationUrl } from "@/lib/guests/auto-register";

/**
 * The auto-registro link: /r/{code} → a WhatsApp chat with the message written.
 *
 * The indirection is the point. A raw `wa.me` link bakes in both our number and
 * the wording, and it gets pasted into group chats that outlive the event — so
 * the number could never change and the copy could never be fixed. Through here
 * both are resolved at the moment someone taps.
 *
 * No auth: the host hands this out on purpose. It discloses the event code and
 * the host's name, which is exactly what the message it opens already says.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  const event = await db.query.events.findFirst({
    where: eq(events.registrationCode, code.toLowerCase()),
  });

  // Deliberately the same answer for a code that never existed and one whose
  // registration is closed: a link in a group chat is public, and which events
  // exist is not something a stranger needs confirmed.
  if (!event || !event.autoRegisterEnabled || event.archivedAt) {
    return new NextResponse("Este registro ya no está disponible.", { status: 404 });
  }

  const destination = whatsappRegistrationUrl(event);
  if (!destination) {
    return new NextResponse("Este registro no está disponible por ahora.", { status: 503 });
  }

  // 302: the number and the wording both resolve per tap, and a permanent
  // redirect would be cached past the next change to either.
  return NextResponse.redirect(destination, 302);
}
