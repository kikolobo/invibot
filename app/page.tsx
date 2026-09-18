import { SiteShell } from "@/components/site-chrome";
import { Phone, type Line } from "@/components/chat";

const heroThread: Line[] = [
  {
    side: "in",
    time: "10:24",
    card: {
      kind: "Nuestra boda",
      hosts: "Ana & Carlos",
      date: "14 de febrero, 2027",
      venue: "Hacienda San Gabriel",
    },
    text: "María, Ana y Carlos te invitan a su boda. ¿Podrás acompañarnos?",
  },
  { side: "out", time: "10:31", text: "Ahí estaré 🤍 voy con mi esposo" },
  {
    side: "in",
    time: "10:31",
    text: "¡Qué gusto, María! Quedan registrados los dos. Te mando la ubicación unos días antes.",
  },
  { side: "out", time: "10:33", text: "¿Hay estacionamiento en la hacienda?" },
  {
    side: "in",
    time: "10:33",
    text: "Sí, hay valet sin costo en la entrada principal. Si prefieren, la hacienda está a 20 minutos del centro en taxi.",
  },
];

const guestAsk: Line[] = [
  { side: "out", time: "18:02", text: "Oye, ¿pueden ir niños?" },
  {
    side: "in",
    time: "18:02",
    text: "Déjame confirmarlo con Ana y te aviso enseguida.",
  },
  { side: "in", time: "18:14", text: "Ya lo confirmé: sí, son bienvenidos los niños de la familia. 🙂" },
];

const organizerAsk: Line[] = [
  {
    side: "in",
    time: "18:03",
    text: "María González pregunta:\n«¿Pueden ir niños?»\n\nRespóndeme aquí y yo le contesto.",
  },
  { side: "out", time: "18:13", text: "Sí, pero nada más los de la familia" },
  {
    side: "in",
    time: "18:14",
    text: "Listo, ya le contesté. Lo guardé para los siguientes invitados que pregunten lo mismo.",
  },
];

const features = [
  {
    title: "Contesta como persona",
    body: "«Ahí estaré», «voy con mi esposa», «al final no puedo». Sin formularios, sin ligas obligatorias, en español y a cualquier hora.",
  },
  {
    title: "Nunca inventa",
    body: "Si la respuesta no está en la información de tu evento, te pregunta a ti antes de contestar. Y aprende la respuesta para la próxima.",
  },
  {
    title: "Tu lista, siempre al día",
    body: "Quién confirmó, con cuántos acompañantes, quién falta por responder y quién no podrá llegar.",
  },
];

export default function Home() {
  return (
    <SiteShell tone="night">
      <section className="px-6 pt-8 pb-20 sm:px-10 sm:pt-14">
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <p className="eyebrow !text-gold">En desarrollo · México</p>
            <h1 className="mt-6 text-night-text">
              {/* Italic serif over heavy sans, the way the reference sets its
                  own name. The serif carries the people, the sans carries the
                  fact — and the size difference is the whole effect, so it is
                  deliberately more than feels comfortable. */}
              <span className="block font-display text-6xl italic leading-[0.95] tracking-tight sm:text-8xl">
                Tus invitados
              </span>
              <span className="-mt-1 block text-5xl font-semibold leading-[0.95] tracking-[-0.03em] sm:text-7xl">
                ya confirmaron.
              </span>
            </h1>
            <p className="mt-7 text-lg leading-relaxed text-night-soft">
              Envía las invitaciones por WhatsApp y deja que un asistente con
              inteligencia artificial administre las confirmaciones y responda
              las dudas de cada invitado. Tú sólo revisas las listas.
            </p>
            <p className="mt-4 leading-relaxed text-night-soft">
              Agrega a tus invitados tú mismo o comparte una liga de
              autorregistro que tú apruebas. Controla el acceso con códigos QR
              únicos por persona. Entre otras funciones diseñadas para elevar el
              control de tu evento.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href="mailto:hola@invibot.com?subject=Quiero%20probar%20Invibot&body=Hola%2C%20me%20interesa%20probar%20Invibot.%0A%0ATipo%20de%20evento%3A%20%0AFecha%20aproximada%3A%20%0AN%C3%BAmero%20de%20invitados%3A%20"
                className="inline-flex items-center justify-center rounded-full border border-gold px-8 py-3.5 text-sm font-medium tracking-wide text-gold transition-colors hover:bg-gold hover:text-night"
              >
                Quiero probarlo
              </a>
              <p className="text-sm text-night-soft">
                Estamos tomando los primeros eventos.
              </p>
            </div>
          </div>

          <Phone
            title="Boda Ana & Carlos"
            subtitle="en línea"
            lines={heroThread}
            className="mx-auto lg:mx-0"
          />
        </div>
      </section>

      <section className="bg-paper px-6 py-24 sm:px-10 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow">Lo que no sabe, lo pregunta</p>
          <h2 className="mt-6 max-w-3xl font-display text-5xl leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Un agente de IA contesta las dudas de tus invitados. Y lo que no
            sabe, lo aprende de ti <em className="italic">una sola vez</em>.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
            Te lo pregunta a ti por WhatsApp, le contesta a tu invitado con tus
            palabras y guarda la respuesta. El siguiente que pregunte lo mismo
            recibe la respuesta al instante, sin molestarte otra vez.
          </p>

          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:gap-16">
            <div>
              <p className="eyebrow mb-4">En el teléfono de tu invitada</p>
              <Phone title="Boda Ana & Carlos" subtitle="en línea" lines={guestAsk} />
            </div>
            <div>
              <p className="eyebrow mb-4">En el tuyo</p>
              <Phone title="Invibot" subtitle="tu asistente" lines={organizerAsk} />
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 sm:grid-cols-3">
            {features.map((feature, i) => (
              <div key={feature.title} className="border-t border-night-line pt-6">
                <span className="font-display text-sm text-gold">0{i + 1}</span>
                <h2 className="mt-3 font-display text-3xl leading-tight text-night-text">
                  {feature.title}
                </h2>
                <p className="mt-3 leading-relaxed text-night-soft">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-paper px-6 py-24 sm:px-10 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-5xl leading-[1.05] tracking-tight text-ink sm:text-6xl">
            ¿Tienes un <em className="italic">evento</em> cerca?
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-ink-soft">
            Estamos trabajando con un número limitado de eventos para afinar el
            producto. Escríbenos y lo revisamos contigo.
          </p>
          <a
            href="mailto:hola@invibot.com?subject=Quiero%20probar%20Invibot"
            className="mt-9 inline-flex items-center justify-center rounded-full border border-ink px-8 py-3.5 text-sm font-medium tracking-wide text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            hola@invibot.com
          </a>
        </div>
      </section>
    </SiteShell>
  );
}
