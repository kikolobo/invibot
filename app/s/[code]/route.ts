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

  // Switched off by the organizer. 410, "it was here and is gone", and not
  // counted: the clicks are people who reached where it went.
  if (link.disabledAt) {
    return new NextResponse(UNAVAILABLE, {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
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

/**
 * A page rather than a line of text: it opens in WhatsApp's own browser, on a
 * phone, in front of a guest who expected something else.
 */
const UNAVAILABLE = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Enlace no disponible</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
    font-family: system-ui, -apple-system, sans-serif; background: #47433d; color: #f7f4f0; text-align: center; }
  h1 { font-size: 1.3rem; font-weight: 600; margin: 0 0 8px; }
  p { margin: 0; color: #bdb5ac; line-height: 1.5; }
</style>
</head>
<body>
  <main>
    <h1>El enlace no está disponible</h1>
    <p>Quien te lo envió lo desactivó.</p>
  </main>
</body>
</html>`;
