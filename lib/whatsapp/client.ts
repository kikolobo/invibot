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

export type WhatsAppConfig = {
  phoneNumberId: string;
  accessToken: string;
};

export function configFromEnv(): WhatsAppConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
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
export async function markRead(config: WhatsAppConfig, messageId: string): Promise<void> {
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
      }),
    },
  ).catch(() => {
    // Read receipts are cosmetic; never fail a turn over one.
  });
}
