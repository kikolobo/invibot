import { eq, sql } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/db";
import { shortLinks } from "@/db/schema";

/**
 * invibot.com/s/{code} → the link the organizer pasted into a message.
 *
 * No auth: it is handed to guests by definition. Only http(s) targets are
 * followed, though nothing else can be stored — a check here costs nothing
 * and keeps this from ever becoming a way to open something stranger.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  const link = await db.query.shortLinks.findFirst({
    where: eq(shortLinks.code, code.toLowerCase()),
  });
  if (!link || !/^https?:\/\//i.test(link.url)) {
    return new NextResponse("No encontramos ese enlace.", { status: 404 });
  }

  // Counted after answering, so a slow write never holds up the redirect.
  after(async () => {
    await db
      .update(shortLinks)
      .set({ clicks: sql`${shortLinks.clicks} + 1`, lastClickedAt: new Date() })
      .where(eq(shortLinks.id, link.id));
  });

  // 302, not 301: a browser keeps a permanent redirect forever, and a code
  // should stay ours to repoint.
  return NextResponse.redirect(link.url, 302);
}
