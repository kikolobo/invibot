/**
 * Thin wrapper over Meta's WhatsApp Cloud API.
 *
 * Direct rather than through a BSP: our margin is the per-message cost, and a
 * reseller's markup comes out of every invitation forever. See SERVICES.md.
 */

const GRAPH_VERSION = "v21.0";

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; code: string; title: string; detail?: string; retryable: boolean };

/**
 * Which of our two numbers a message goes out through.
 *
 * Both stay configured at once. Meta's test number reaches only the five
 * recipients allow-listed in the dashboard and costs nothing; the live number
 * reaches anybody and bills every conversation. They sit on different WABAs,
 * which matters more than it sounds: templates are approved per WABA, so the
 * two profiles do not share a template library and a send that works on one
 * can come back `132001` on the other.
 */
export type WhatsAppProfile = "test" | "production";

export const PROFILES: readonly WhatsAppProfile[] = ["test", "production"];

export type WhatsAppConfig = {
  profile: WhatsAppProfile;
  phoneNumberId: string;
  /** Needed to read or edit templates. Never needed to send. */
  wabaId: string | null;
  /**
   * The number as a human dials it, digits only — `16193045456`.
   *
   * Nothing about sending needs this: Graph addresses a number by its id. It
   * exists for `wa.me` links, which are the one place we hand the number to a
   * person rather than to Meta, and the id is useless there.
   */
  displayPhone: string | null;
  accessToken: string;
};

/** First of these that holds something. An empty string counts as unset — a
 * blanked-out variable in a dashboard should behave like a missing one. */
function read(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

/**
 * The profile that opens new conversations.
 *
 * Defaults to `test`, deliberately. An environment that forgot to say lands on
 * the number that can only reach allow-listed phones, which fails loudly and
 * for free. The opposite default would let a missing variable spend money on
 * strangers.
 */
export function activeProfile(): WhatsAppProfile {
  return process.env.WHATSAPP_PROFILE?.trim().toLowerCase() === "production"
    ? "production"
    : "test";
}

/**
 * Credentials for one profile, or null when that profile is not configured.
 *
 * `test` falls back to the unprefixed variables, which is what every
 * environment holds today — so nothing breaks in the window between deploying
 * this and editing Vercel. `production` has no such fallback on purpose: the
 * live number is only ever used because somebody named it.
 *
 * The access token falls back to the shared one for both, because a single
 * system user holds both WABAs. The per-profile names exist for the day that
 * stops being true.
 */
export function whatsappConfig(
  profile: WhatsAppProfile = activeProfile(),
): WhatsAppConfig | null {
  const prefix = profile === "production" ? "WHATSAPP_PROD_" : "WHATSAPP_TEST_";
  const legacy = profile === "production" ? [] : ["WHATSAPP_"];
  const field = (suffix: string) =>
    read(`${prefix}${suffix}`, ...legacy.map((name) => name + suffix));

  const phoneNumberId = field("PHONE_NUMBER_ID");
  const accessToken = read(`${prefix}ACCESS_TOKEN`, "WHATSAPP_ACCESS_TOKEN");
  if (!phoneNumberId || !accessToken) return null;

  return {
    profile,
    phoneNumberId,
    wabaId: field("WABA_ID"),
    // Tolerant of "+52 55 1234 5678" in the environment; wa.me wants bare digits.
    displayPhone: field("DISPLAY_PHONE")?.replace(/\D/g, "") ?? null,
    accessToken,
  };
}

/**
 * The profile an inbound message arrived on.
 *
 * Both numbers deliver to the same webhook — one Meta app, one URL — so a
 * reply has to follow the number it came in on rather than the active profile.
 * Answering a test-number message from the live number would bill a real
 * conversation to a stranger, and its template fallback would fail outright
 * because the two WABAs share no templates.
 *
 * Null for a number we do not recognise, which is a reason to record the
 * message and say nothing rather than to guess.
 */
export function configForPhoneNumberId(phoneNumberId: string): WhatsAppConfig | null {
  for (const profile of PROFILES) {
    const config = whatsappConfig(profile);
    if (config?.phoneNumberId === phoneNumberId) return config;
  }
  return null;
}

/**
 * Meta wants the recipient without a leading "+". Everything inside the app
 * stores canonical E.164, so the stripping happens here rather than being
 * remembered at each call site.
 */
const toRecipient = (e164: string) => e164.replace(/^\+/, "");

/** Error codes worth retrying; anything else is a permanent failure for this send. */
const RETRYABLE = new Set([
  "1",     // unknown/transient API error
  "2",     // service temporarily unavailable
  "4",     // application request limit reached
  "80007", // rate limit hit
  "130429",// throughput limit
  "131048",// spam rate limit
  "131056",// pair rate limit
]);

async function post(
  config: WhatsAppConfig,
  body: Record<string, unknown>,
): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      },
    );
  } catch (cause) {
    return {
      ok: false,
      code: "network",
      title: cause instanceof Error ? cause.message : "Network error",
      retryable: true,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { code?: number; message?: string; error_data?: { details?: string } };
  };

  if (response.ok && payload.messages?.[0]?.id) {
    return { ok: true, messageId: payload.messages[0].id };
  }

  const code = String(payload.error?.code ?? response.status);
  return {
    ok: false,
    code,
    title: payload.error?.message ?? `HTTP ${response.status}`,
    detail: payload.error?.error_data?.details,
    // 5xx is Meta's problem and worth retrying; 4xx usually means the request
    // itself is wrong and retrying would just burn quota.
    retryable: RETRYABLE.has(code) || response.status >= 500 || response.status === 429,
  };
}

/**
 * Free-form message. Only legal inside the 24-hour customer service window —
 * after a guest has messaged us. Outside it, Meta rejects the send and only a
 * template will go through.
 */
export function sendText(
  config: WhatsAppConfig,
  to: string,
  body: string,
  previewUrl = false,
): Promise<SendResult> {
  return post(config, {
    recipient_type: "individual",
    to: toRecipient(to),
    type: "text",
    text: { body, preview_url: previewUrl },
  });
}

/**
 * Free-form image, with the caption WhatsApp renders under it. Same window rule
 * as `sendText`: only legal once the guest has written to us.
 *
 * Sent by media id rather than a link. A link would mean the card sits at a
 * public URL — permanently, for anyone who finds it — and the card has the
 * venue and the date on it.
 */
export function sendImage(
  config: WhatsAppConfig,
  to: string,
  mediaId: string,
  caption?: string,
): Promise<SendResult> {
  return post(config, {
    recipient_type: "individual",
    to: toRecipient(to),
    type: "image",
    image: { id: mediaId, ...(caption ? { caption } : {}) },
  });
}

export type ReplyButton = {
  /** Comes back on the webhook as `interactive.button_reply.id`. */
  payload: string;
  /** What the guest reads. Meta caps it at 20 characters. */
  label: string;
};

/**
 * Buttons without a template.
 *
 * The same quick replies an approved template carries, except that inside the
 * 24-hour window they need no approval at all and cost nothing — and the
 * payloads are ours, so `parseIntent` reads a tap here exactly as it reads a
 * tap on the invitation. Three at most; Meta rejects a fourth.
 */
export function sendButtons(
  config: WhatsAppConfig,
  to: string,
  body: string,
  buttons: ReplyButton[],
): Promise<SendResult> {
  return post(config, {
    recipient_type: "individual",
    to: toRecipient(to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((button) => ({
          type: "reply",
          reply: { id: button.payload, title: button.label.slice(0, 20) },
        })),
      },
    },
  });
}

export type LocationPayload = {
  latitude: number;
  longitude: number;
  /** The venue as the guest knows it — shown in bold on the map card. */
  name?: string;
  /** The street line under it. */
  address?: string;
};

/**
 * A native map card: a real pin the guest taps to open their own maps app.
 *
 * Same 24-hour window rule as text and images, which is exactly why it suits a
 * guest who just asked where the party is — their question opened the window.
 * The invitation itself cannot use this and keeps the short link.
 */
export function sendLocation(
  config: WhatsAppConfig,
  to: string,
  location: LocationPayload,
): Promise<SendResult> {
  return post(config, {
    recipient_type: "individual",
    to: toRecipient(to),
    type: "location",
    location,
  });
}

export type MediaUploadResult =
  | { ok: true; mediaId: string }
  | { ok: false; title: string; detail?: string };

/**
 * Uploads bytes to Meta and returns the handle to send them with.
 *
 * The handle is tied to this phone number and expires — Meta documents roughly
 * 30 days — so the original has to stay in our own storage and be re-uploaded
 * when the handle stops working. Not a cache we can lose: a card the organizer
 * uploaded once must keep arriving for as long as guests keep confirming.
 */
export async function uploadMedia(
  config: WhatsAppConfig,
  bytes: ArrayBuffer,
  contentType: string,
  filename = "invitacion",
): Promise<MediaUploadResult> {
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", contentType);
  form.set("file", new Blob([bytes], { type: contentType }), filename);

  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/media`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.accessToken}` },
      body: form,
    });
  } catch (cause) {
    return { ok: false, title: cause instanceof Error ? cause.message : "Network error" };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string; error_data?: { details?: string } };
  };

  if (response.ok && payload.id) return { ok: true, mediaId: payload.id };

  return {
    ok: false,
    title: payload.error?.message ?? `HTTP ${response.status}`,
    detail: payload.error?.error_data?.details,
  };
}

export type TemplateComponent =
  | { type: "header"; parameters: { type: "image"; image: { link: string } }[] }
  | { type: "body"; parameters: { type: "text"; text: string }[] }
  | { type: "button"; sub_type: "quick_reply"; index: string; parameters: { type: "payload"; payload: string }[] };

/**
 * Pre-approved template. Required for anything we initiate, which is every
 * invitation and every reminder — a template per event is impossible, so the
 * library stays small and parameterised.
 */
export function sendTemplate(
  config: WhatsAppConfig,
  to: string,
  name: string,
  language: string,
  components: TemplateComponent[] = [],
): Promise<SendResult> {
  return post(config, {
    recipient_type: "individual",
    to: toRecipient(to),
    type: "template",
    template: { name, language: { code: language }, components },
  });
}

/** Marks an inbound message read, so the guest sees the blue ticks. */
/**
 * Marks a message read, and optionally shows the typing bubble.
 *
 * One call does both — Meta hangs the typing indicator off the read receipt.
 * It runs for up to 25 seconds or until the next message is sent, whichever
 * comes first, so it is fired the moment we know we intend to answer rather
 * than after the model has finished thinking. A guest who wrote a real question
 * otherwise watches nothing happen for several seconds and assumes they are
 * talking to a machine that ignored them.
 */
export async function markRead(
  config: WhatsAppConfig,
  messageId: string,
  typing = false,
): Promise<void> {
  await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        ...(typing ? { typing_indicator: { type: "text" } } : {}),
      }),
    },
  ).catch(() => {
    // Read receipts and typing bubbles are cosmetic; never fail a turn over one.
  });
}
