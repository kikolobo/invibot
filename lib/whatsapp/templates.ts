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

/**
 * The small grey line under every message.
 *
 * Meta caps a footer at 60 characters, which is the whole reason the opt-out
 * shortened: "Responde BAJA para dejar de recibir mensajes" left no room for
 * the credit. Marketing templates must keep an opt-out — it is what makes the
 * send legitimate — so the credit rides alongside it. Utility templates answer
 * something the guest just did and have no list to leave, so they carry the
 * credit alone.
 */
const marketingFooter = "Responde BAJA para no recibir más · Powered by Invibot";
const utilityFooter = "Powered by Invibot";

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
    footer: marketingFooter,
    buttons: [
      { label: "Sí, asistiré", payload: "RSVP_YES" },
      { label: "No podré", payload: "RSVP_NO" },
      { label: "Tengo una duda", payload: "ASK_QUESTION" },
    ],
  },

  /**
   * The invitation for a guest who may bring someone.
   *
   * A separate template rather than a fourth button on the first one: WhatsApp
   * allows three quick replies, and splitting "yes" into solo and plus-one uses
   * the slot that held "Tengo una duda". The body still invites a question in
   * words, which is where those go anyway.
   *
   * Sent only to guests whose `partySizeAllowed` is exactly 2. A party of four
   * cannot be expressed in buttons at all and stays on the plain invitation.
   */
  invitacion_evento_acompanante: {
    name: "invitacion_evento_acompanante",
    language: "es_MX",
    category: "MARKETING",
    kind: "invite",
    header: { format: "TEXT", text: "Tienes una invitación" },
    body: [
      "Hola {{1}} ✨",
      "",
      "{{2}} te invita a {{3}} 🥂",
      "",
      "📅 {{4}}",
      "📍 {{5}}",
      "",
      "Tu invitación incluye un lugar para ti y un acompañante. Confírmanos aquí abajo 👇",
      "",
      "Cualquier duda, aquí estoy al pendiente.",
    ].join("\n"),
    variables: [
      { description: "Nombre del invitado", example: "María" },
      { description: "Anfitriones, como los lee el invitado", example: "Ana y Carlos" },
      { description: "Nombre del evento", example: "nuestra boda" },
      { description: "Fecha y hora en la zona del evento", example: "sábado 14 de marzo, 5:00 PM" },
      { description: "Lugar", example: "Hacienda San Pedro, Monterrey" },
    ],
    footer: marketingFooter,
    buttons: [
      { label: "Asistiré solo", payload: "RSVP_YES_SOLO" },
      { label: "Con +1", payload: "RSVP_YES_PLUS_ONE" },
      // Same payload as the plain invitation: one decline means one thing.
      { label: "No asistiré", payload: "RSVP_NO" },
    ],
  },

  /**
   * The invitation again, after the event moved.
   *
   * A separate template because an approved one cannot be edited, and because
   * a guest who never answered needs the buttons back — their 24-hour window
   * closed long ago, so a free-form message cannot reach them at all.
   *
   * {{2}} names what changed, in the organizer's words, so one template covers
   * a new date, a new venue, or both.
   */
  invitacion_actualizada: {
    name: "invitacion_actualizada",
    language: "es_MX",
    category: "MARKETING",
    kind: "invite",
    header: { format: "TEXT", text: "Actualizamos tu invitación" },
    body: [
      "Hola {{1}} ✨",
      "",
      "Hubo un cambio en {{2}}:",
      "{{3}}",
      "",
      "📅 {{4}}",
      "📍 {{5}}",
      "",
      "Confirma tu asistencia aquí abajo 👇",
    ].join("\n"),
    variables: [
      { description: "Nombre del invitado", example: "María" },
      { description: "Nombre del evento", example: "nuestra boda" },
      { description: "Qué cambió", example: "Cambió la fecha" },
      { description: "Fecha y hora nuevas", example: "sábado 21 de marzo, 5:00 PM" },
      { description: "Lugar nuevo", example: "Hacienda San Pedro, Monterrey" },
    ],
    footer: marketingFooter,
    buttons: [
      { label: "Sí, asistiré", payload: "RSVP_YES" },
      { label: "No podré", payload: "RSVP_NO" },
      { label: "Tengo una duda", payload: "ASK_QUESTION" },
    ],
  },

  /** The same, for a guest whose invitation includes a companion. */
  invitacion_actualizada_acompanante: {
    name: "invitacion_actualizada_acompanante",
    language: "es_MX",
    category: "MARKETING",
    kind: "invite",
    header: { format: "TEXT", text: "Actualizamos tu invitación" },
    body: [
      "Hola {{1}} ✨",
      "",
      "Hubo un cambio en {{2}}:",
      "{{3}}",
      "",
      "📅 {{4}}",
      "📍 {{5}}",
      "",
      "Tu invitación incluye un lugar para ti y un acompañante. Confírmanos aquí abajo 👇",
    ].join("\n"),
    variables: [
      { description: "Nombre del invitado", example: "María" },
      { description: "Nombre del evento", example: "nuestra boda" },
      { description: "Qué cambió", example: "Cambió el lugar" },
      { description: "Fecha y hora nuevas", example: "sábado 21 de marzo, 5:00 PM" },
      { description: "Lugar nuevo", example: "Hacienda San Pedro, Monterrey" },
    ],
    footer: marketingFooter,
    buttons: [
      { label: "Asistiré solo", payload: "RSVP_YES_SOLO" },
      { label: "Con +1", payload: "RSVP_YES_PLUS_ONE" },
      { label: "No asistiré", payload: "RSVP_NO" },
    ],
  },

  /**
   * A change of plan for someone already coming.
   *
   * No buttons: they have confirmed, and asking them to confirm again invites a
   * "no" that was never on the table. If the change breaks their plans they can
   * say so, and the assistant is listening.
   */
  aviso_cambio_evento: {
    name: "aviso_cambio_evento",
    language: "es_MX",
    category: "UTILITY",
    kind: "logistics",
    header: { format: "TEXT", text: "Cambio en el evento" },
    body: [
      "Hola {{1}} 🙏",
      "",
      "Te aviso de un cambio en {{2}}:",
      "{{3}}",
      "",
      "📅 {{4}}",
      "📍 {{5}}",
      "",
      "Si esto te cambia los planes, avísame por aquí.",
    ].join("\n"),
    variables: [
      { description: "Nombre del invitado", example: "María" },
      { description: "Nombre del evento", example: "nuestra boda" },
      { description: "Qué cambió", example: "Cambió la fecha" },
      { description: "Fecha y hora nuevas", example: "sábado 21 de marzo, 5:00 PM" },
      { description: "Lugar nuevo", example: "Hacienda San Pedro, Monterrey" },
    ],
    footer: marketingFooter,
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
    footer: utilityFooter,
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
    footer: utilityFooter,
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
    footer: utilityFooter,
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

/**
 * The template as the guest will read it, with the variables substituted.
 *
 * Rendered from the same definition that was submitted to Meta so that the
 * preview an organizer approves is the message that actually goes out. A
 * hand-written mockup would drift the moment a template is resubmitted, and the
 * whole point of the preview is that nobody sends 80 marketing messages on
 * trust.
 */
export function renderTemplate(
  name: TemplateName,
  values: string[],
): { header: string | null; body: string; footer: string | null; buttons: string[] } {
  const definition: TemplateDefinition = templates[name];

  if (values.length !== definition.variables.length) {
    throw new Error(
      `Template ${name} takes ${definition.variables.length} variables, got ${values.length}`,
    );
  }

  return {
    header: definition.header?.format === "TEXT" ? definition.header.text : null,
    // Leaves an unmatched placeholder visible rather than blanking it: a
    // preview that silently drops {{4}} hides exactly the bug worth catching.
    body: definition.body.replace(/\{\{(\d+)\}\}/g, (match, index) => values[Number(index) - 1] ?? match),
    footer: definition.footer ?? null,
    buttons: definition.buttons?.map((button) => button.label) ?? [],
  };
}
