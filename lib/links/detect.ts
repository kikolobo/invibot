import { publicBase } from "@/lib/public-url";

/**
 * Which links in a message get shortened, and swapping them in. No database
 * here, so the rules can be checked without one.
 */

export const SHORT_PREFIX = "/s/";
export const CODE_LENGTH = 7;

/** "invibot.com", without the scheme: WhatsApp links a bare domain on its own. */
export function shortHost(): string {
  return publicBase().replace(/^https?:\/\//, "");
}

/**
 * Only links with a scheme. A bare "ejemplo.com" is short already, and
 * guessing at domains is how "Sr.Pérez" becomes a link. It also means an
 * already shortened "invibot.com/s/…" is never matched in the first place.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi;

/**
 * Punctuation that ends the sentence, not the link — plus WhatsApp's own
 * *bold*, _italic_ and ~strike~ markers wrapped around it. A closing
 * parenthesis stays when the link opened one, as Wikipedia's do.
 */
function trimTail(raw: string): string {
  let url = raw;
  for (;;) {
    const last = url.at(-1);
    if (!last) return url;
    if (".,;:!?'*_~".includes(last)) {
      url = url.slice(0, -1);
    } else if (last === ")" && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
      url = url.slice(0, -1);
    } else {
      return url;
    }
  }
}

/** Ours already: the site, the microsite, the maps and short links. */
function isOwn(url: URL): boolean {
  const own = new URL(publicBase()).hostname.replace(/^www\./, "");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return host === own || host.endsWith(`.${own}`) || host === "invibot.com" || host.endsWith(".invibot.com");
}

/**
 * The distinct links worth shortening, in the order they appear.
 *
 * Left alone: our own links, and anything no longer than the short one would
 * be — swapping bit.ly/abc for a link of ours saves nothing and hides where it
 * goes.
 */
export function linksToShorten(text: string): string[] {
  const shortLength = `${shortHost()}${SHORT_PREFIX}`.length + CODE_LENGTH;
  const found = new Set<string>();
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimTail(match[0]);
    if (found.has(url) || url.length <= shortLength) continue;
    try {
      if (isOwn(new URL(url))) continue;
    } catch {
      continue;
    }
    found.add(url);
  }
  return [...found];
}

/** Puts each short link where its long one was, keeping the punctuation after it. */
export function replaceLinks(text: string, replacements: Map<string, string>): string {
  if (replacements.size === 0) return text;
  return text.replace(URL_PATTERN, (raw) => {
    const url = trimTail(raw);
    const short = replacements.get(url);
    return short ? short + raw.slice(url.length) : raw;
  });
}
