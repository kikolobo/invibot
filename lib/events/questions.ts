import type { EventKind } from "./kinds";

/**
 * The intake questionnaire, as data rather than a hardcoded form.
 *
 * One renderer walks this catalog, so adding a question — or a whole new event
 * kind — never touches the wizard. Every answer lands in two places: the typed
 * `details` JSONB on the event (via `key`, a dotted path), and an `event_facts`
 * row phrased as a question/answer pair the agent can quote to guests.
 *
 * That second projection is the point. The organizer thinks they are filling in
 * a form; what they are really doing is writing the assistant's knowledge base.
 */

export type QuestionType =
  | "boolean"
  | "select"
  | "text"
  | "longtext"
  | "money"
  | "urls";

export type Option = { value: string; es: string; en: string };

export type SectionId =
  | "lugar"
  | "logistica"
  | "comida"
  | "protocolo"
  | "detalles";

export type Answers = Record<string, unknown>;

export type Question = {
  /** Dotted path into EventDetails, or `extras.<name>` for kind-specific answers. */
  key: string;
  section: SectionId;
  type: QuestionType;
  /** The question as the organizer sees it. */
  es: string;
  en: string;
  /** Clarifying line under the field. */
  help?: { es: string; en: string };
  options?: Option[];
  placeholder?: { es: string; en: string };
  /** Shown on the guest microsite. */
  guestVisible: boolean;
  /** Projected into event_facts for the agent to cite. */
  feedsAgent: boolean;
  /**
   * How the fact reads in the knowledge base — phrased as a guest would ask it,
   * so semantic matching against an incoming question actually works.
   */
  factEs?: string;
  /**
   * The answer sentence for each side of a boolean, written to read correctly
   * against `factEs`. Required for booleans: a bare "Sí" is ambiguous next to a
   * two-part question, and is outright wrong wherever the organizer-facing
   * question and the guest-facing one have opposite polarity ("¿es sin costo?"
   * answered yes means "no, you don't pay").
   */
  boolAnswer?: { yes: string; no: string };
  /** Only ask when this returns true. */
  appliesWhen?: (a: Answers) => boolean;
  required?: boolean;
};

export const sections: Record<SectionId, { es: string; en: string }> = {
  lugar: { es: "El lugar", en: "The venue" },
  logistica: { es: "Cómo llegar", en: "Getting there" },
  comida: { es: "Comida y bebida", en: "Food and drink" },
  protocolo: { es: "Protocolo", en: "Protocol" },
  detalles: { es: "Detalles finales", en: "Final details" },
};

const isOutdoor = (a: Answers) =>
  a["setting"] === "outdoor" || a["setting"] === "both";

/** Asked for every event kind. */
/**
 * The four diet questions, which differ only in wording.
 *
 * Three-way rather than yes/no: an organizer who has not asked the caterer yet
 * should be able to say so, and "no sé" escalates to them when a guest asks
 * rather than the assistant answering "no" on their behalf. Telling someone
 * coeliac there is nothing for them, wrongly, is the failure worth designing
 * against.
 */
const dietQuestions: Question[] = [
  {
    key: "menuVegan",
    es: "¿Hay opción vegana?",
    en: "Is there a vegan option?",
    factEs: "¿Hay comida vegana?",
  },
  {
    key: "menuVegetarian",
    es: "¿Hay opción vegetariana?",
    en: "Is there a vegetarian option?",
    factEs: "¿Hay comida vegetariana?",
  },
  {
    key: "menuGlutenFree",
    es: "¿Hay opción sin gluten?",
    en: "Is there a gluten-free option?",
    factEs: "¿Hay comida sin gluten? Soy celíaco.",
  },
  {
    key: "menuHealthy",
    es: "¿Hay opción saludable o ligera?",
    en: "Is there a healthy or light option?",
    factEs: "¿Hay algo ligero o saludable de comer?",
  },
].map((diet) => ({
  key: diet.key,
  section: "comida" as const,
  type: "select" as const,
  es: diet.es,
  en: diet.en,
  options: [
    { value: "yes", es: "Sí", en: "Yes" },
    { value: "no", es: "No", en: "No" },
    { value: "undecided", es: "Todavía no sé", en: "Not sure yet" },
  ],
  guestVisible: true,
  feedsAgent: true,
  factEs: diet.factEs,
  // Only worth asking once there is food to ask about.
  appliesWhen: (a: Answers) => a.meal !== undefined && a.meal !== "none",
}));

const universal: Question[] = [
  {
    key: "setting",
    section: "lugar",
    type: "select",
    es: "¿El evento es en interior o al aire libre?",
    en: "Is the event indoors or outdoors?",
    options: [
      { value: "indoor", es: "En interior", en: "Indoors" },
      { value: "outdoor", es: "Al aire libre", en: "Outdoors" },
      { value: "both", es: "Un poco de cada uno", en: "Both" },
      { value: "undecided", es: "Todavía no lo sé", en: "Not sure yet" },
    ],
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿El evento es en interior o al aire libre?",
    required: true,
  },
  {
    key: "rainPolicy",
    section: "lugar",
    type: "select",
    es: "Si llueve, ¿qué pasa?",
    en: "What happens if it rains?",
    help: {
      es: "Es de las primeras cosas que preguntan los invitados cuando el evento es al aire libre.",
      en: "One of the first things guests ask about an outdoor event.",
    },
    options: [
      { value: "covered", es: "Hay un área techada", en: "There's a covered area" },
      { value: "rain_or_shine", es: "Se hace de todos modos", en: "It happens regardless" },
      { value: "postponed", es: "Se pospone", en: "It gets postponed" },
      { value: "cancelled", es: "Se cancela", en: "It gets cancelled" },
      { value: "undecided", es: "Todavía no lo decidimos", en: "Not decided yet" },
    ],
    appliesWhen: isOutdoor,
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Qué pasa si llueve?",
  },
  {
    key: "parking.valet",
    section: "logistica",
    type: "boolean",
    es: "¿Va a haber valet parking?",
    en: "Will there be valet parking?",
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Hay valet parking?",
    boolAnswer: {
      yes: "Sí, hay valet parking en el lugar.",
      no: "No hay valet parking.",
    },
  },
  {
    key: "parking.onSite",
    section: "logistica",
    type: "boolean",
    es: "¿Hay estacionamiento en el lugar?",
    en: "Is there parking at the venue?",
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Dónde me puedo estacionar?",
    boolAnswer: {
      yes: "Sí, hay estacionamiento en el lugar.",
      no: "El lugar no tiene estacionamiento propio.",
    },
  },
  {
    key: "parking.note",
    section: "logistica",
    type: "text",
    es: "¿Algo más sobre el estacionamiento?",
    en: "Anything else about parking?",
    placeholder: {
      es: "Es limitado, conviene llegar temprano",
      en: "It's limited, arrive early",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Cómo está el estacionamiento?",
  },
  {
    key: "transportSuggestion",
    section: "logistica",
    type: "text",
    es: "¿Recomiendas alguna forma de llegar?",
    en: "Any transport you'd recommend?",
    placeholder: {
      es: "Recomendamos Uber o taxi, el estacionamiento es limitado",
      en: "We suggest Uber or a taxi, parking is limited",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Cómo me recomiendan llegar?",
  },
  {
    key: "arrivalNote",
    section: "logistica",
    type: "text",
    es: "¿A qué hora quieres que lleguen?",
    en: "When should guests arrive?",
    placeholder: {
      es: "La ceremonia empieza puntual, llega 20 minutos antes",
      en: "The ceremony starts on time, arrive 20 minutes early",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿A qué hora debo llegar?",
  },
  {
    key: "meal",
    section: "comida",
    type: "select",
    es: "¿Va a haber comida?",
    en: "Will there be food?",
    options: [
      { value: "none", es: "No, sólo bebidas", en: "No, drinks only" },
      { value: "canapes", es: "Canapés o botana", en: "Canapés or snacks" },
      { value: "brunch", es: "Brunch", en: "Brunch" },
      { value: "breakfast", es: "Desayuno", en: "Breakfast" },
      { value: "lunch", es: "Comida", en: "Lunch" },
      { value: "dinner", es: "Cena", en: "Dinner" },
      { value: "snack", es: "Merienda", en: "Afternoon snack" },
      { value: "dessert_only", es: "Sólo postre", en: "Dessert only" },
      { value: "breakfast_lunch", es: "Desayuno y comida", en: "Breakfast and lunch" },
      { value: "lunch_dinner", es: "Comida y cena", en: "Lunch and dinner" },
      {
        value: "breakfast_lunch_dinner",
        es: "Desayuno, comida y cena",
        en: "Breakfast, lunch and dinner",
      },
    ],
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Va a haber comida? ¿Ceno antes de llegar?",
    required: true,
  },
  {
    key: "menuNotes",
    section: "comida",
    type: "longtext",
    es: "Datos del menú que quieras que sepa",
    en: "Anything about the menu the assistant should know",
    help: {
      es: "Lo que sirven, de dónde es la comida, si hay algo que un invitado deba saber antes de llegar.",
      en: "What is being served, and anything a guest should know before arriving.",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Qué van a servir de comer?",
    // Only worth asking once there is food to describe.
    appliesWhen: (a) => a.meal !== undefined && a.meal !== "none",
  },
  ...dietQuestions,
  {
    key: "drinks",
    section: "comida",
    type: "select",
    es: "¿Y las bebidas?",
    en: "What about drinks?",
    options: [
      { value: "open_bar", es: "Barra libre", en: "Open bar" },
      { value: "limited_bar", es: "Barra limitada", en: "Limited bar" },
      { value: "byob", es: "Cada quien lleva lo suyo", en: "Bring your own" },
      { value: "soft_drinks_only", es: "Sin alcohol", en: "No alcohol" },
      { value: "none", es: "No habrá bebidas", en: "No drinks" },
    ],
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Hay barra libre?",
  },
  {
    key: "attire",
    section: "protocolo",
    type: "select",
    es: "¿Cuál es el código de vestimenta?",
    en: "What's the dress code?",
    options: [
      { value: "casual", es: "Casual", en: "Casual" },
      { value: "smart_casual", es: "Casual elegante", en: "Smart casual" },
      { value: "cocktail", es: "Cóctel", en: "Cocktail" },
      { value: "formal", es: "Formal", en: "Formal" },
      { value: "black_tie", es: "Etiqueta / rigurosa etiqueta", en: "Black tie" },
      { value: "themed", es: "Temático", en: "Themed" },
    ],
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Cómo me visto? ¿Cuál es el código de vestimenta?",
    required: true,
  },
  {
    key: "attireNote",
    section: "protocolo",
    type: "text",
    es: "¿Algo más sobre cómo vestirse?",
    en: "Anything else about attire?",
    help: {
      es: "Aquí caben los detalles que evitan confusiones: colores a evitar, si el piso es de pasto, si hace frío en la noche.",
      en: "The details that prevent confusion: colors to avoid, grass underfoot, chilly evenings.",
    },
    placeholder: {
      es: "El jardín es de pasto, evita tacón delgado",
      en: "The garden is grass, avoid stiletto heels",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Hay alguna recomendación sobre cómo vestirme?",
  },
  {
    key: "kidsWelcome",
    section: "protocolo",
    type: "boolean",
    es: "¿Pueden ir niños?",
    en: "Are children welcome?",
    help: {
      es: "Si dices que no, el asistente sabrá contestarlo con tacto cuando pregunten.",
      en: "If not, the assistant will know to answer tactfully when asked.",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Puedo llevar a mis hijos? ¿Pueden ir niños?",
    boolAnswer: {
      yes: "Sí, los niños son bienvenidos.",
      no: "Es un evento sólo para adultos.",
    },
    required: true,
  },
  {
    key: "cost.isFree",
    section: "detalles",
    type: "boolean",
    es: "¿El evento es sin costo para los invitados?",
    en: "Is the event free for guests?",
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Tengo que pagar algo?",
    // Polarity flips here: the organizer is asked "is it free?", the guest asks
    // "do I have to pay?". Answering the first yes means answering the second no.
    boolAnswer: {
      yes: "No, el evento es sin costo para los invitados.",
      no: "Sí, el evento tiene un costo.",
    },
    required: true,
  },
  {
    key: "cost.note",
    section: "detalles",
    type: "text",
    es: "¿Cuánto y cómo se paga?",
    en: "How much, and how do they pay?",
    appliesWhen: (a) => a["cost.isFree"] === false,
    placeholder: {
      es: "$500 por persona, transferencia antes del 1 de febrero",
      en: "$500 per person, transfer before February 1",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Cuánto cuesta y cómo pago?",
  },
  {
    key: "bringSomething",
    section: "detalles",
    type: "text",
    es: "¿Tienen que llevar algo?",
    en: "Should guests bring anything?",
    placeholder: { es: "Traje de baño y toalla", en: "Swimsuit and towel" },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Tengo que llevar algo?",
  },
  {
    key: "endTimeNote",
    section: "detalles",
    type: "text",
    es: "¿A qué hora termina?",
    en: "When does it end?",
    placeholder: { es: "Alrededor de las 2 de la mañana", en: "Around 2am" },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿A qué hora termina el evento?",
  },
  {
    key: "accessibilityNote",
    section: "detalles",
    type: "text",
    es: "¿Hay algo que deban saber sobre accesibilidad?",
    en: "Anything guests should know about accessibility?",
    placeholder: {
      es: "Hay rampa y elevador; el jardín tiene escalones",
      en: "Ramp and elevator available; the garden has steps",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿El lugar es accesible para silla de ruedas?",
  },
  {
    key: "customNotes",
    section: "detalles",
    type: "longtext",
    es: "¿Algo más que tus invitados deban saber?",
    en: "Anything else your guests should know?",
    help: {
      es: "Escríbelo como se lo dirías a un amigo. El asistente lo usará para contestar.",
      en: "Write it as you'd tell a friend. The assistant will use it to answer.",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "Otros detalles del evento",
  },
];

const wedding: Question[] = [
  {
    key: "extras.ceremonyType",
    section: "protocolo",
    type: "select",
    es: "¿Qué tipo de ceremonia es?",
    en: "What kind of ceremony is it?",
    options: [
      { value: "religious", es: "Religiosa", en: "Religious" },
      { value: "civil", es: "Civil", en: "Civil" },
      { value: "both", es: "Civil y religiosa", en: "Both" },
      { value: "symbolic", es: "Simbólica", en: "Symbolic" },
    ],
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Qué tipo de ceremonia es?",
  },
  {
    key: "extras.ceremonyVenue",
    section: "protocolo",
    type: "text",
    es: "¿La ceremonia es en otro lugar que la recepción?",
    en: "Is the ceremony somewhere other than the reception?",
    placeholder: {
      es: "Parroquia de San Agustín, 5:00 pm — recepción en la hacienda a las 7:00",
      en: "San Agustín church, 5pm — reception at the hacienda at 7pm",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Dónde y a qué hora es la ceremonia?",
  },
  {
    key: "extras.colorToAvoid",
    section: "protocolo",
    type: "text",
    es: "¿Hay algún color que prefieras que no usen?",
    en: "Any color you'd rather guests avoid?",
    placeholder: { es: "Blanco y beige", en: "White and beige" },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Hay colores que no deba usar?",
  },
  {
    key: "registry.hasRegistry",
    section: "detalles",
    type: "boolean",
    es: "¿Tienen mesa de regalos?",
    en: "Do you have a gift registry?",
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Tienen mesa de regalos? ¿Qué les regalo?",
    boolAnswer: {
      yes: "Sí, hay mesa de regalos.",
      no: "No hay mesa de regalos.",
    },
  },
  {
    key: "registry.urls",
    section: "detalles",
    type: "urls",
    es: "Liga de la mesa de regalos",
    en: "Registry link",
    appliesWhen: (a) => a["registry.hasRegistry"] === true,
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Dónde está la mesa de regalos?",
  },
  {
    key: "registry.note",
    section: "detalles",
    type: "text",
    es: "¿Alguna preferencia sobre los regalos?",
    en: "Any preference about gifts?",
    help: {
      es: "Por ejemplo «lluvia de sobres», que no siempre es una liga.",
      en: "For example a cash gift preference, which isn't always a link.",
    },
    placeholder: { es: "Lluvia de sobres", en: "Cash gifts preferred" },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Prefieren algún tipo de regalo?",
  },
  {
    key: "extras.hotelBlock",
    section: "logistica",
    type: "text",
    es: "¿Hay hotel con tarifa especial?",
    en: "Is there a hotel with a special rate?",
    placeholder: {
      es: "Hotel Central, menciona «Boda Ana y Carlos» al reservar",
      en: "Hotel Central, mention the wedding when booking",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Hay hotel recomendado o con descuento?",
  },
  {
    key: "extras.shuttle",
    section: "logistica",
    type: "text",
    es: "¿Va a haber transporte desde algún punto?",
    en: "Will there be a shuttle from anywhere?",
    placeholder: {
      es: "Camión del Hotel Central a las 4:30 pm, regreso a la 1:00 am",
      en: "Shuttle from Hotel Central at 4:30pm, returning at 1am",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Hay transporte al lugar?",
  },
];

const quinceanera: Question[] = [
  {
    key: "extras.misa",
    section: "protocolo",
    type: "text",
    es: "¿Hay misa de acción de gracias?",
    en: "Is there a thanksgiving mass?",
    placeholder: {
      es: "Parroquia del Sagrado Corazón, 6:00 pm",
      en: "Sagrado Corazón church, 6pm",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Dónde y a qué hora es la misa?",
  },
  {
    key: "extras.vals",
    section: "protocolo",
    type: "text",
    es: "¿A qué hora es el vals?",
    en: "What time is the waltz?",
    help: {
      es: "Los invitados preguntan para no llegar tarde a lo importante.",
      en: "Guests ask so they don't miss the moment that matters.",
    },
    placeholder: { es: "Alrededor de las 9:00 pm", en: "Around 9pm" },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿A qué hora es el vals?",
  },
  {
    key: "extras.colorToAvoid",
    section: "protocolo",
    type: "text",
    es: "¿Hay algún color reservado para la festejada?",
    en: "Any color reserved for the birthday girl?",
    placeholder: { es: "Rosa palo", en: "Dusty rose" },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Hay colores que no deba usar?",
  },
  {
    key: "registry.hasRegistry",
    section: "detalles",
    type: "boolean",
    es: "¿Hay mesa de regalos?",
    en: "Is there a gift registry?",
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Qué le regalo? ¿Hay mesa de regalos?",
    boolAnswer: {
      yes: "Sí, hay mesa de regalos.",
      no: "No hay mesa de regalos.",
    },
  },
  {
    key: "registry.note",
    section: "detalles",
    type: "text",
    es: "¿Alguna preferencia sobre los regalos?",
    en: "Any preference about gifts?",
    placeholder: { es: "Lluvia de sobres", en: "Cash gifts preferred" },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Prefieren algún tipo de regalo?",
  },
];

const corporate: Question[] = [
  {
    key: "extras.registration",
    section: "logistica",
    type: "text",
    es: "¿Cómo es el registro al llegar?",
    en: "How does check-in work?",
    placeholder: {
      es: "Registro en el lobby a partir de las 8:30, presenta tu identificación",
      en: "Check-in in the lobby from 8:30, bring photo ID",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Cómo me registro al llegar? ¿Necesito gafete?",
  },
  {
    key: "parking.validated",
    section: "logistica",
    type: "boolean",
    es: "¿Se valida el estacionamiento?",
    en: "Is parking validated?",
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Validan el estacionamiento?",
    boolAnswer: {
      yes: "Sí, se valida el estacionamiento en el registro.",
      no: "No se valida el estacionamiento.",
    },
  },
  {
    key: "extras.agenda",
    section: "protocolo",
    type: "longtext",
    es: "¿Cuál es el programa?",
    en: "What's the agenda?",
    placeholder: {
      es: "9:00 bienvenida · 9:30 keynote · 11:00 mesa redonda · 13:00 comida",
      en: "9:00 welcome · 9:30 keynote · 11:00 panel · 13:00 lunch",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Cuál es el programa o la agenda del evento?",
  },
  {
    key: "extras.wifi",
    section: "detalles",
    type: "text",
    es: "¿Hay wifi para los asistentes?",
    en: "Is there wifi for attendees?",
    placeholder: { es: "Red «Eventos», sin contraseña", en: "Network \"Events\", no password" },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Hay wifi?",
  },
  {
    key: "extras.recorded",
    section: "detalles",
    type: "boolean",
    es: "¿Se va a grabar o transmitir?",
    en: "Will it be recorded or streamed?",
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Se va a grabar? ¿Habrá transmisión en vivo?",
    boolAnswer: {
      yes: "Sí, el evento se va a grabar.",
      no: "No se va a grabar el evento.",
    },
  },
  {
    key: "extras.invoice",
    section: "detalles",
    type: "text",
    es: "¿Cómo se factura?",
    en: "How does invoicing work?",
    help: {
      es: "Si el evento tiene costo, en México lo preguntan casi siempre.",
      en: "If the event has a fee, this comes up constantly in Mexico.",
    },
    appliesWhen: (a) => a["cost.isFree"] === false,
    placeholder: {
      es: "Envía tus datos fiscales a facturacion@empresa.com",
      en: "Send your tax details to billing@company.com",
    },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Me pueden dar factura?",
  },
];

const birthday: Question[] = [
  {
    key: "extras.surprise",
    section: "protocolo",
    type: "boolean",
    es: "¿Es una fiesta sorpresa?",
    en: "Is it a surprise party?",
    help: {
      es: "Si lo es, el asistente tendrá cuidado de no arruinarla y te avisará si alguien pregunta de más.",
      en: "If so, the assistant will be careful not to spoil it.",
    },
    guestVisible: false,
    feedsAgent: true,
    factEs: "¿Es sorpresa? (no revelar al festejado)",
    boolAnswer: {
      yes: "Es una fiesta sorpresa. Nunca confirmes ni menciones el evento al festejado.",
      no: "No es sorpresa.",
    },
  },
  {
    key: "extras.giftPreference",
    section: "detalles",
    type: "text",
    es: "¿Alguna indicación sobre regalos?",
    en: "Any guidance about gifts?",
    placeholder: { es: "Sin regalos, sólo tu compañía", en: "No gifts, just your company" },
    guestVisible: true,
    feedsAgent: true,
    factEs: "¿Llevo regalo?",
  },
];

const byKind: Partial<Record<EventKind, Question[]>> = {
  wedding,
  quinceanera,
  corporate,
  product_launch: corporate,
  birthday,
  anniversary: wedding,
};

/** The full ordered question list for an event kind. */
export function questionsFor(kind: EventKind): Question[] {
  return [...universal, ...(byKind[kind] ?? [])];
}

/** Only the questions that apply given what has been answered so far. */
export function visibleQuestions(kind: EventKind, answers: Answers): Question[] {
  return questionsFor(kind).filter((q) => !q.appliesWhen || q.appliesWhen(answers));
}

export const sectionOrder: SectionId[] = [
  "lugar",
  "logistica",
  "comida",
  "protocolo",
  "detalles",
];
