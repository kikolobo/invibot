import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/db";
import { events } from "@/db/schema";
import { whatsappRegistrationUrl } from "@/lib/guests/auto-register";
import { eventKindLabels } from "@/lib/events/kinds";
import { formatEventDate } from "@/lib/events/format";
import { publicBase } from "@/lib/public-url";
import { OpenWhatsApp } from "./open-whatsapp";

type EventRow = typeof events.$inferSelect;

/**
 * The auto-registro link: /r/{code}.
 *
 * A page rather than a redirect, and that is the whole point. WhatsApp builds
 * its preview by fetching this URL; a 302 took the crawler to `wa.me` and the
 * card it produced was WhatsApp advertising itself. Serving real HTML with our
 * own Open Graph tags is the only way to choose what a shared link looks like.
 *
 * The person is sent on from the browser instead — crawlers do not run
 * JavaScript, so they stop here at the tags, and everyone else is in WhatsApp
 * a moment later.
 */
export const dynamic = "force-dynamic";

async function openEvent(code: string): Promise<EventRow | null> {
  const event = await db.query.events.findFirst({
    where: eq(events.registrationCode, code.toLowerCase()),
  });
  // Same answer for a code that never existed and one that has been turned
  // off: a link in a group chat is public, and which events exist is not
  // something a stranger needs confirmed.
  if (!event || !event.autoRegisterEnabled || event.archivedAt) return null;
  return event;
}

/**
 * The same words on the card and on the button.
 *
 * It says nothing about WhatsApp: this is read inside WhatsApp, by someone who
 * got here from a WhatsApp message, and the line is too short to spend on where
 * they already are.
 */
const CALL_TO_ACTION = "Toca aquí para registrarte y confirmar";

/** "el cumpleaños de Ana" → "El cumpleaños de Ana". */
const sentence = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * What the event is called in public.
 *
 * The kind, whose it is, and the date — and deliberately nothing else. This is
 * the same set of facts the prefilled message already carries, so the preview
 * discloses nothing new to whoever the link is forwarded to. The venue is not
 * here and must never be: that is what the private invitation card is for.
 */
function describe(event: EventRow) {
  const kind = eventKindLabels[event.kind].esInline;
  const host = event.hostNames?.trim();
  return sentence(`${kind} ${host ? `de ${host}` : event.name.trim()}`);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const event = await openEvent(code);

  if (!event) {
    return { title: "Registro no disponible", robots: { index: false, follow: false } };
  }

  // The date rides in the title because the description is what WhatsApp
  // truncates, and "when" is the fact worth protecting. The description says
  // what tapping does — the old one told people already inside WhatsApp that a
  // link opens WhatsApp, which spent the scarcest line saying nothing.
  //
  // Careful not to promise an invitation here. Tapping this registers you; the
  // host still has to approve. "Estás invitado" on the card followed by "tu
  // registro aún no está procesado" in the chat would read as a bait and switch.
  const title = `${describe(event)} · ${formatEventDate(event)}`;
  // Prefixed only on the card: "RSVP" tells someone scrolling a group chat what
  // this link is before they read the rest. On the button it would be noise —
  // by then they are on the page and the heading has already said it.
  const description = `RSVP: ${CALL_TO_ACTION}`;

  // `v` is the upload time, so replacing the teaser cannot be served from a
  // cache holding the old picture.
  const image = event.teaserR2Key
    ? `${publicBase()}/r/${event.registrationCode}/imagen?v=${event.teaserUploadedAt?.getTime() ?? 0}`
    : null;

  return {
    title,
    description,
    // Somebody's wedding has no business in a search index. The link is meant
    // to be handed around, not found.
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title,
      description,
      url: `${publicBase()}/r/${event.registrationCode}`,
      ...(image ? { images: [{ url: image, alt: title }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function RegistroLink({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const event = await openEvent(code);
  if (!event) notFound();

  const destination = whatsappRegistrationUrl(event);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div>
        <p className="eyebrow">Registro</p>
        <h1 className="mt-3 font-display text-3xl leading-tight text-ink">
          {describe(event)}
        </h1>
        <p className="mt-2 text-[0.95rem] text-ink-muted">{sentence(formatEventDate(event))}</p>
      </div>

      {destination ? (
        <>
          {/* Visible for the instant before the redirect lands, and the whole
              page for anyone whose browser did not run it. */}
          <a
            href={destination}
            className="rounded-full bg-action px-6 py-3 text-[0.95rem] text-ink-onaction"
          >
            {CALL_TO_ACTION}
          </a>
          <OpenWhatsApp href={destination} />
        </>
      ) : (
        <p className="text-[0.9rem] text-ink-muted">
          Este registro no está disponible por ahora.
        </p>
      )}
    </main>
  );
}
