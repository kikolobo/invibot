import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "@/db";
import { shortLinks } from "@/db/schema";
import { CODE_LENGTH, linksToShorten, replaceLinks, shortBase, SHORT_PREFIX } from "./detect";

/** Seven characters with no 0/O or 1/l, same alphabet as the maps links. */
const newCode = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", CODE_LENGTH);

async function codeFor(eventId: string, url: string): Promise<string> {
  const existing = await db.query.shortLinks.findFirst({
    where: and(eq(shortLinks.eventId, eventId), eq(shortLinks.url, url)),
  });
  if (existing) return existing.code;

  // A clash on the code is one in tens of billions; retrying beats checking.
  for (let attempt = 0; attempt < 3; attempt++) {
    const [created] = await db
      .insert(shortLinks)
      .values({ eventId, url, code: newCode() })
      .onConflictDoNothing()
      .returning({ code: shortLinks.code });
    if (created) return created.code;

    // Either the code collided, or the same link was saved concurrently.
    const raced = await db.query.shortLinks.findFirst({
      where: and(eq(shortLinks.eventId, eventId), eq(shortLinks.url, url)),
    });
    if (raced) return raced.code;
  }
  throw new Error("Could not mint a short link code");
}

/**
 * Replaces every long link in a message with invibot.com/s/{code}.
 *
 * Left alone: our own links, and anything no longer than the short one would
 * be — swapping bit.ly/abc for a link of ours saves nothing and hides where it
 * goes. Running it twice changes nothing, which is what lets every save call
 * it without checking whether an earlier save already did.
 */
export async function shortenLinks(eventId: string, text: string): Promise<string> {
  const replacements = new Map<string, string>();
  for (const url of linksToShorten(text)) {
    replacements.set(url, `${shortBase()}${SHORT_PREFIX}${await codeFor(eventId, url)}`);
  }
  return replaceLinks(text, replacements);
}
