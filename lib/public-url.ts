/**
 * Where a guest-facing link points: the live site, always.
 *
 * Emphatically *not* BETTER_AUTH_URL, which is "http://localhost:3000" on a
 * developer's machine — a real guest was once sent
 * "localhost:3000/m/fffb47b6" because a change notice went out from a local
 * run. Nor the preview hostname Vercel mints per deployment: an invitation is
 * read weeks later, long after that host is gone. The link resolves against
 * production because that is the only place it can work.
 */
const PUBLIC_SITE = "https://invibot.com";

export function publicBase(): string {
  const override = process.env.INVIBOT_PUBLIC_URL?.trim();
  return (override || PUBLIC_SITE).replace(/\/$/, "");
}
