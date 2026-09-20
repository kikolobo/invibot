import { sendDuePasses } from "@/lib/passes/send";
import { remindTomorrowsGuests } from "@/lib/passes/remind";
import { remindUnansweredRsvps } from "@/lib/guests/rsvp-reminder";

/**
 * The daily pass run: the day-before message for tomorrow's events, and any
 * pass whose wait is over.
 *
 * The day-before message lives here and only here. The cron fires at 11:00 in
 * Monterrey, which is an hour "¡Es mañana!" should arrive at; nothing driven by
 * inbound traffic may send it, or it lands whenever somebody else happens to
 * write. Eleven rather than ten so the run also falls inside the hours the RSVP
 * nudge is allowed to use.
 *
 * The due passes are the other half. A QR follows its card by forty-five
 * minutes and nothing here can hold a timer that long — Inngest is still a
 * plan, and a serverless function is measured in seconds. The wait is a
 * column; this is the backstop that empties it for the guest who confirms last
 * and is followed by silence. Inbound webhook traffic does most of that work.
 *
 * Authenticated with `CRON_SECRET`, which Vercel Cron sends as a bearer token.
 * Without the variable set the route refuses everything rather than defaulting
 * to open — an unprotected endpoint that sends WhatsApp messages is an
 * unprotected endpoint that spends money.
 */
export const dynamic = "force-dynamic";

/**
 * The day-before run is one template per confirmed guest of every event
 * tomorrow, and it gets exactly one chance — the next run is the day of, when
 * the message would be wrong.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Forbidden", { status: 403 });
  }

  const reminded = await remindTomorrowsGuests();
  const sent = await sendDuePasses();
  const nudged = await remindUnansweredRsvps();
  return Response.json({ reminded, sent, nudged }, { status: 200 });
}
