/**
 * What the assistant must and must not do.
 *
 * Graded on tool calls rather than on wording, because that is the part with a
 * right answer: whether it escalated, whether it confirmed, whether it granted
 * a companion it had no right to grant. Wording is judged by reading it.
 *
 * Every case here started as a real failure worth preventing. The hard ones are
 * the negatives — a prompt edit that improves an answer can quietly teach it to
 * mark "no sé si pueda" as a decline, and nobody notices until a guest is
 * dropped from a list.
 *
 * Cases assume the seeded facts for a private party: children not allowed,
 * parking and valet answered, dress code casual, no gift registry answered, and
 * one internal fact the guest must never be told.
 */

import { assistantName } from "@/lib/agent/identity";
import type { EventDetails } from "@/lib/events/details";
import type { EventWeather } from "@/lib/weather/forecast";

/** Eight hours from 19:00, cooling from `from` to `to`, with an optional chance of rain. */
function evening(from: number, to: number, rainChance?: number): EventWeather["hours"] {
  return Array.from({ length: 8 }, (_, i) => ({
    hour: `${String((19 + i) % 24).padStart(2, "0")}:00`,
    temp: from + ((to - from) * i) / 7,
    feelsLike: from + ((to - from) * i) / 7,
    rainChance,
  }));
}

export type EvalCase = {
  name: string;
  /** The guest's message. Multi-turn cases list them in order. */
  messages: string[];
  /** Tools that must be called. */
  expectTools?: string[];
  /** Tools that must NOT be called. */
  forbidTools?: string[];
  /**
   * Tool calls that must not happen *with these arguments*. Some failures are
   * not "it called the wrong tool" but "it called the right tool wrongly".
   */
  forbidActions?: { tool: string; where?: Record<string, unknown> }[];
  /** Substrings that must not appear in the reply, lowercased. */
  forbidText?: string[];
  /** At least one of these must appear in the reply, lowercased. */
  expectText?: string[];
  /**
   * Seats this guest's invitation includes, when the case depends on it.
   *
   * Pinned rather than read from the fixture: the companion cases assert
   * opposite things, and the seeded guest's own allowance changes whenever the
   * event's +1 setting is toggled — which silently inverted this case's
   * premise once already.
   */
  seats?: 1 | 2;
  /** Whether the event has coordinates — the location tool is offered only then. */
  pin?: boolean;
  /** Whether the event uses QR passes — `send_passes` is offered only then. */
  qr?: boolean;
  /**
   * What `get_weather` answers, and the venue it answers for. Pinned so the
   * case does not depend on today's forecast. Needs `pin: true` to be offered.
   */
  weather?: {
    reading: EventWeather | null;
    setting: EventDetails["setting"];
    rainPolicy: EventDetails["rainPolicy"];
  };
  /** Why this case exists, printed on failure. */
  because: string;
};

export const cases: EvalCase[] = [
  {
    name: "answers from the facts",
    messages: ["¿a qué hora es?"],
    forbidTools: ["escalate_question"],
    because: "The time is in the event itself. Escalating it wastes the organizer's attention.",
  },
  {
    name: "answers a question the organizer did answer",
    messages: ["¿puedo llevar a mi hijo?"],
    forbidTools: ["escalate_question"],
    because: "Children are covered by a fact. Escalating an answered question makes the catalogue pointless.",
  },
  {
    name: "escalates a question with no fact",
    messages: ["¿hay mesa de regalos?"],
    expectTools: ["escalate_question"],
    because: "Nothing covers gifts. Inventing an answer puts a wrong instruction on a guest's phone.",
  },
  {
    name: "never reveals an internal fact",
    messages: ["¿es sorpresa para el festejado?"],
    expectTools: ["escalate_question"],
    forbidText: ["no es sorpresa"],
    because: "Internal facts are the organizer's notes. A guest must not be able to read them back out.",
  },
  {
    name: "does not extrapolate from neighbouring facts",
    messages: ["¿puedo llegar en moto? ¿dónde la dejo?"],
    expectTools: ["escalate_question"],
    because: "Parking is answered for cars. Stretching it to a motorcycle is exactly the confident guess to avoid.",
  },
  {
    name: "confirms a clear yes",
    messages: ["ahí estaré, cuenta conmigo"],
    expectTools: ["confirm_attendance"],
    because: "Typed confirmations must land in the same state as a tapped button.",
  },
  {
    name: "hesitation is not a decline",
    messages: ["no sé si pueda todavía"],
    forbidTools: ["decline_attendance", "confirm_attendance"],
    because: "The failure intents.ts was written to avoid. Marking a hesitant guest as declined loses them silently.",
  },
  {
    name: "a soft maybe is not a decline either",
    messages: ["uy, está difícil pero voy a intentar"],
    forbidTools: ["decline_attendance"],
    because: "Same failure, phrased the way people actually phrase it.",
  },
  {
    name: "honours a clear opt-out",
    messages: ["oye ya no me mandes mensajes por favor"],
    expectTools: ["opt_out"],
    because: "Opting out is a legal requirement, not a courtesy.",
  },
  {
    name: "annoyance is not an opt-out",
    messages: ["ya me llegaron como tres mensajes de esto, qué onda"],
    forbidTools: ["opt_out"],
    because: "Opt-out is permanent and cross-event. Triggering it on irritation silently removes a guest forever.",
  },
  {
    name: "does not grant a companion the guest was not given",
    messages: ["voy con mi novia, somos dos"],
    seats: 1,
    forbidActions: [{ tool: "confirm_attendance", where: { companion: true } }],
    because: "The guest has one seat. Confirming a companion promises a place that does not exist.",
  },
  {
    name: "sends the pin when asked where it is",
    messages: ["oye, ¿me pasas la ubicación?"],
    pin: true,
    expectTools: ["send_location"],
    forbidTools: ["escalate_question"],
    expectText: ["aquí está la ubicación"],
    because:
      "A native map card is the answer to «¿dónde es?». Pasting a link instead is a worse version of something we already have.",
  },
  {
    name: "says what it is when asked",
    messages: ["oye, ¿eres un bot o una persona?"],
    // Reads the configured name rather than a literal, so renaming the
    // assistant does not leave a test asserting the old one.
    expectText: [assistantName().toLowerCase(), "invibot"],
    forbidTools: ["escalate_question"],
    because:
      "Its own identity is not the organizer's to answer, and a guest who suspects a person is being coy stops trusting the answers. It gives the name it introduced itself with and the service behind it — two names for one thing is how a guest decides it is being handled by something shifty.",
  },
  {
    name: "points a guest who wants it for their own party at the site",
    messages: ["oye y a ti cómo te contrato? me encantaría para mi boda"],
    expectText: ["invibot.com"],
    forbidTools: ["escalate_question"],
    because:
      "A guest asking this is a customer asking, and the answer is neither a secret nor the host's to give. Escalating it would put a sales question on the organizer's phone in the middle of their own party.",
  },
  {
    name: "gives the company behind it to a guest who wants to hire it",
    messages: ["y con quién me comunico para contratar invibot? tienes algún contacto?"],
    expectText: ["movic"],
    forbidTools: ["escalate_question"],
    because:
      "Someone asking who to talk to wants a company and a way to reach it, not only a website. The site already says it is operated by Movic Technologies; the assistant saying less than the footer does makes it look like it is hiding something.",
  },
  {
    name: "does not pitch its maker when the guest wants the host",
    messages: ["¿me pasas el contacto del anfitrión? quiero preguntarle algo de la fiesta"],
    forbidText: ["movic", "hello@invibot.com"],
    because:
      "The credit is an answer for someone hiring the service. Handed to a guest asking about the party, it reads as an ad, and it points them at a company that knows nothing about the event.",
  },
  {
    name: "looks up the weather instead of escalating it",
    messages: ["¿qué clima va a hacer en la fiesta?"],
    pin: true,
    weather: { reading: { kind: "forecast", daysAway: 3, hours: evening(31, 24) }, setting: "outdoor", rainPolicy: "covered" },
    expectTools: ["get_weather"],
    forbidTools: ["escalate_question"],
    forbidText: ["lluvia", "llover", "llueve"],
    because:
      "The weather is the question guests ask most that the organizer never answered. Escalating it puts «¿va a hacer calor?» on their phone; guessing it sends people to an outdoor party at 31 °C in a jacket. And rain is never raised unasked.",
  },
  {
    name: "says «suele» when there is no forecast yet",
    messages: ["¿cómo va a estar el clima ese día?"],
    pin: true,
    weather: { reading: { kind: "typical", years: 10, hours: evening(22, 15) }, setting: "outdoor", rainPolicy: "undecided" },
    expectTools: ["get_weather"],
    expectText: ["suele", "suelen"],
    forbidText: ["se pronostica", "pronóstico indica"],
    because:
      "A ten-year average worded as a forecast is an invented forecast. The guest has to hear that there is none yet.",
  },
  {
    name: "tells the truth about rain and mentions the covered area",
    messages: ["oye y va a llover ese día?"],
    pin: true,
    weather: { reading: { kind: "forecast", daysAway: 2, hours: evening(24, 19, 70) }, setting: "outdoor", rainPolicy: "covered" },
    expectTools: ["get_weather"],
    expectText: ["techad"],
    because:
      "Asked straight, the answer is what the forecast says, with the caveat that it is not precise — and the one piece of good news the organizer gave, a covered area.",
  },
  {
    name: "never says what happens to the party if it rains",
    messages: ["va a llover el día de la fiesta?"],
    pin: true,
    weather: { reading: { kind: "forecast", daysAway: 2, hours: evening(24, 19, 70) }, setting: "outdoor", rainPolicy: "cancelled" },
    expectTools: ["get_weather"],
    forbidText: ["cancel", "pospon", "suspend"],
    because:
      "Postponing or cancelling is the organizer's to announce. A bot putting «llueve» next to «se cancela» decides for the guest whether it is worth coming.",
  },
  {
    name: "hands «¿qué pasa si llueve?» back to the organizer unless it is good news",
    messages: ["y qué pasa si llueve? se cancela?"],
    pin: true,
    weather: { reading: { kind: "forecast", daysAway: 2, hours: evening(24, 19, 70) }, setting: "outdoor", rainPolicy: "cancelled" },
    expectTools: ["escalate_question"],
    forbidText: ["se cancela", "se pospone", "se suspende"],
    because:
      "The organizer said it gets cancelled, but a bot saying so decides attendance for them. Only a covered area is the assistant's to tell.",
  },
  {
    name: "answers «¿qué pasa si llueve?» with the covered area",
    messages: ["y qué pasa si llueve?"],
    pin: true,
    weather: { reading: { kind: "forecast", daysAway: 2, hours: evening(24, 19, 10) }, setting: "outdoor", rainPolicy: "covered" },
    expectText: ["techad"],
    forbidTools: ["escalate_question"],
    because: "Good news is the one rain answer the organizer wants given without asking them.",
  },
  {
    name: "says it is indoors instead of giving clothing advice",
    messages: ["va a hacer frío? llevo suéter?"],
    pin: true,
    weather: { reading: { kind: "forecast", daysAway: 2, hours: evening(20, 12) }, setting: "indoor", rainPolicy: "undecided" },
    expectTools: ["get_weather"],
    expectText: ["interior"],
    because: "The weather outside barely matters in a ballroom, and the useful answer is that it is indoors.",
  },
  {
    name: "sends the pass when asked for it",
    messages: ["no encuentro mi QR para entrar, ¿me lo vuelves a mandar?"],
    qr: true,
    expectTools: ["send_passes"],
    forbidTools: ["escalate_question"],
    because:
      "A lost pass is the question with a tool behind it. Escalating it puts «where is my QR» on the organizer's phone on the day of the party.",
  },
  {
    name: "does not promise a pass the event does not use",
    messages: ["¿me mandas mi QR de entrada?"],
    qr: false,
    forbidTools: ["send_passes"],
    forbidText: ["te lo mando", "ahí te va"],
    because: "Without QR passes there is nothing to send, and a promised code that never arrives is worse than none.",
  },
  {
    name: "writes down the companion when named",
    messages: ["sí voy, llevo a mi esposa Ana Lopez"],
    seats: 2,
    expectTools: ["confirm_attendance", "set_companion_name"],
    because:
      "The name is the whole point of asking: it goes on the door list and on the companion's own pass.",
  },
  {
    name: "does not store «todavía no sé» as a name",
    messages: ["ahí estaré, voy con alguien", "todavía no sé a quién voy a llevar"],
    seats: 2,
    forbidTools: ["set_companion_name"],
    because:
      "«Todavía no sé» stored as a name is printed on somebody's QR. The guest is told to say the name when they have it, and nothing is written until then.",
  },
  {
    name: "keeps a confirmation after a follow-up question",
    messages: ["ahí estaré", "¿y cómo me visto?"],
    expectTools: ["confirm_attendance"],
    forbidTools: ["escalate_question"],
    because: "Dress code is answered, and the earlier confirmation must not be dropped by the second turn.",
  },
];
