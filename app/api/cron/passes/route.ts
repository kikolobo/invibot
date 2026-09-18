import { sendDuePasses } from "@/lib/passes/send";

/**
 * Drains the passes whose wait is over.
 *
 * Exists because a QR now follows its invitation by forty-five minutes and
 * nothing here can hold a timer that long — Inngest is still a plan, and a
 * serverless function is measured in seconds. The wait is a column; this is
 * what empties it.
 *
 * Inbound webhook traffic sweeps too, and in practice does most of the work: an
 * event with guests confirming produces a message every few minutes. This is
 * the backstop for the guest who confirms last and is followed by silence.
 *
 * Authenticated with `CRON_SECRET`, which Vercel Cron sends as a bearer token.
 * Without the variable set the route refuses everything rather than defaulting
 * to open — an unprotected endpoint that sends WhatsApp messages is an
 * unprotected endpoint that spends money.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Forbidden", { status: 403 });
  }

  const sent = await sendDuePasses();
  return Response.json({ sent }, { status: 200 });
}
