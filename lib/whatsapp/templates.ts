import type { sends } from "@/db/schema/messaging";
import type { TemplateComponent } from "./client";

/**
 * The template library.
 *
 * Templates are the only thing we may send to open a conversation, and Meta
 * approves them by hand over days. A template per event is therefore impossible
 * — these are parameterised and serve every event forever.
 *
 * The library stays small on purpose. A template only has to *open* the
 * conversation: the moment a guest replies or taps a button the 24-hour service
 * window opens and the assistant answers in free form, which is both cheaper
 * and unconstrained. Anything that can wait for a reply does not need one.
 */

type SendKind = (typeof sends.kind.enumValues)[number];

export type TemplateVariable = {
  /** What fills this slot, for whoever writes the send call. */
  description: string;
  /** Submitted to Meta as the sample value; reviewers reject vague ones. */
  example: string;
};

export type TemplateButton = {
  label: string;
  /**
   * Set at send time, not at creation — Meta stores only the label. The webhook
   * reads it back as `button.payload`, which is far more robust than matching
   * on the visible text.
   */
  payload: string;
};

export type TemplateDefinition = {
  name: string;
  language: string;
  /**
   * Drives cost, and Meta reclassifies anything it disagrees with. An
   * invitation is marketing however it is worded; everything that answers a
   * guest's own action is genuine utility, which is roughly five times cheaper.
   */
  category: "MARKETING" | "UTILITY";
  kind: SendKind;
  header?: { format: "IMAGE" } | { format: "TEXT"; text: string };
  body: string;
  variables: TemplateVariable[];
  footer?: string;
  buttons?: TemplateButton[];
};

export const templates = {
  /**
   * The invitation. Text only, deliberately: the rendered card goes out as a
   * free-form image the moment the guest taps any button, which costs nothing
   * inside the service window. Putting it in the header would not make this
   * marketing message any cheaper and would block every invitation on the
   * renderer existing.
   */
  invitacion_evento: {
    name: "invitacion_evento",
    language: "es_MX",
    category: "MARKETING",
    kind: "invite",
    // Neutral on purpose — "invitado/invitada" would need a template per gender.
    // No emoji: Meta rejects them in text headers, though the body accepts them.
    header: { format: "TEXT", text: "Tienes una invitación" },
    body: [
      "Hola {{1}} ✨",
      "",
      "{{2}} te invita a {{3}} 🥂",
      "",
      "📅 {{4}}",
      "📍 {{5}}",
      "",
      "Confirma tu asistencia aquí abajo 👇 Si tienes cualquier duda, escríbeme y con gusto te ayudo.",
    ].join("\n"),
    variables: [
      { description: "Nombre del invitado", example: "María" },
      { description: "Anfitriones, como los lee el invitado", example: "Ana y Carlos" },
      { description: "Nombre del evento", example: "nuestra boda" },
      { description: "Fecha y hora en la zona del evento", example: "sábado 14 de marzo, 5:00 PM" },
      { description: "Lugar", example: "Hacienda San Pedro, Monterrey" },
    ],
    footer: "Responde BAJA para dejar de recibir mensajes",
    buttons: [
      { label: "Sí, asistiré", payload: "RSVP_YES" },
      { label: "No podré", payload: "RSVP_NO" },
      { label: "Tengo una duda", payload: "ASK_QUESTION" },
    ],
  },

  /** Nudge before the date. Utility because it follows an invitation already accepted. */
  recordatorio_evento: {
    name: "recordatorio_evento",
    language: "es_MX",
    category: "UTILITY",
    kind: "reminder",
    body: [
      "Hola {{1}}, te recuerdo {{2}}.",
      "",
      "📅 {{3}}",
      "📍 {{4}}",
      "",
      "¿Necesitas algo? Escríbeme por aquí.",
    ].join("\n"),
    variables: [
      { description: "Nombre del invitado", example: "María" },
      { description: "Nombre del evento", example: "la boda de Ana y Carlos" },
      { description: "Fecha y hora en la zona del evento", example: "sábado 14 de marzo, 5:00 PM" },
      { description: "Lugar", example: "Hacienda San Pedro, Monterrey" },
    ],
  },

  /** Sent after the guest confirms, so it answers their own action. */
  confirmacion_rsvp: {
    name: "confirmacion_rsvp",
    language: "es_MX",
    category: "UTILITY",
    kind: "rsvp_confirmation",
    body: [
      "Listo {{1}} ✅",
      "",
      "Tu lugar está confirmado para {{2}}.",
      "",
      "📅 {{3}}",
      "📍 {{4}}",
      "",
      "Si algo cambia, avísame por este medio.",
    ].join("\n"),
    variables: [
      { description: "Nombre del invitado", example: "María" },
      { description: "Nombre del evento", example: "la boda de Ana y Carlos" },
      { description: "Fecha y hora en la zona del evento", example: "sábado 14 de marzo, 5:00 PM" },
      { description: "Lugar", example: "Hacienda San Pedro, Monterrey" },
    ],
  },

  /**
   * The organizer half of the escalation loop: a guest asked something the event
   * facts do not cover, so the organizer is asked once on their own WhatsApp.
   */
  consulta_organizador: {
    name: "consulta_organizador",
    language: "es_MX",
    category: "UTILITY",
    kind: "organizer_relay",
    body: [
      "Hola {{1}}, alguien de {{2}} preguntó:",
      "",
      "«{{3}}»",
      "",
      "Respóndeme por aquí y le comparto la respuesta.",
    ].join("\n"),
    variables: [
      { description: "Nombre del organizador", example: "Ana" },
      { description: "Nombre del evento", example: "tu boda" },
      { description: "Pregunta del invitado, textual", example: "¿Pueden ir niños?" },
    ],
  },
} as const satisfies Record<string, TemplateDefinition>;

export type TemplateName = keyof typeof templates;

/**
 * Builds the `components` array for a send. Order matters: Meta matches
 * positional variables to the order given, so this is the one place that knows
 * how a template's slots line up.
 */
export function buildComponents(
  name: TemplateName,
  values: string[],
  headerImageUrl?: string,
): TemplateComponent[] {
  const definition: TemplateDefinition = templates[name];
  const components: TemplateComponent[] = [];

  if (definition.header?.format === "IMAGE") {
    if (!headerImageUrl) {
      throw new Error(`Template ${name} has an image header but no image URL was given`);
    }
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: headerImageUrl } }],
    });
  }

  if (values.length !== definition.variables.length) {
    throw new Error(
      `Template ${name} takes ${definition.variables.length} variables, got ${values.length}`,
    );
  }

  if (values.length > 0) {
    components.push({
      type: "body",
      parameters: values.map((text) => ({ type: "text", text })),
    });
  }

  // Quick-reply payloads are attached per button index at send time; the
  // approved template carries only the labels.
  definition.buttons?.forEach((button, index) => {
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [{ type: "payload", payload: button.payload }],
    });
  });

  return components;
}

/** The creation payload for `POST /{waba_id}/message_templates`. */
export function toMetaPayload(
  definition: TemplateDefinition,
  headerHandle?: string,
): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];

  if (definition.header?.format === "IMAGE") {
    if (!headerHandle) {
      throw new Error(`Template ${definition.name} needs a sample image handle to be submitted`);
    }
    // The sample is only ever shown to the reviewer; real sends pass a URL.
    components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [headerHandle] } });
  } else if (definition.header?.format === "TEXT") {
    components.push({ type: "HEADER", format: "TEXT", text: definition.header.text });
  }

  components.push({
    type: "BODY",
    text: definition.body,
    ...(definition.variables.length > 0
      ? { example: { body_text: [definition.variables.map((v) => v.example)] } }
      : {}),
  });

  if (definition.footer) components.push({ type: "FOOTER", text: definition.footer });

  if (definition.buttons) {
    components.push({
      type: "BUTTONS",
      buttons: definition.buttons.map((b) => ({ type: "QUICK_REPLY", text: b.label })),
    });
  }

  return {
    name: definition.name,
    language: definition.language,
    category: definition.category,
    components,
  };
}
