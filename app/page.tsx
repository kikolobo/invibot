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
            <h1 className="mt-5 font-display text-5xl leading-[1.03] tracking-tight text-night-text sm:text-7xl">
              Tus invitados
              <br />
              ya confirmaron.
            </h1>
            <p className="mt-7 text-lg leading-relaxed text-night-soft">
              Envía la invitación por WhatsApp y deja que un asistente registre
              las confirmaciones y responda las dudas de cada invitado. Tú solo
              revisas la lista.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href="mailto:hola@invibot.com?subject=Quiero%20probar%20Invibot&body=Hola%2C%20me%20interesa%20probar%20Invibot.%0A%0ATipo%20de%20evento%3A%20%0AFecha%20aproximada%3A%20%0AN%C3%BAmero%20de%20invitados%3A%20"
                className="inline-flex items-center justify-center rounded-full bg-gold px-7 py-3.5 text-sm font-medium text-night transition-colors hover:bg-gold-soft"
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

      <section className="border-t border-night-line bg-night-surface px-6 py-20 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow !text-gold">Lo que no sabe, lo pregunta</p>
          <h2 className="mt-5 max-w-2xl font-display text-4xl leading-tight text-night-text sm:text-5xl">
            Cuando un invitado pregunta algo que no está en tu información, no
            se lo inventa.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-night-soft">
            Te lo pregunta a ti por WhatsApp, le contesta a tu invitado con tus
            palabras y guarda la respuesta. El siguiente que pregunte lo mismo
            recibe la respuesta al instante, sin molestarte otra vez.
          </p>

          <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:gap-16">
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
          <div className="grid gap-10 sm:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="border-t border-night-line pt-6">
                <h2 className="font-display text-2xl text-night-text">
                  {feature.title}
                </h2>
                <p className="mt-2.5 leading-relaxed text-night-soft">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-night-line px-6 py-20 sm:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl leading-tight text-night-text sm:text-5xl">
            ¿Tienes un evento cerca?
          </h2>
          <p className="mt-5 leading-relaxed text-night-soft">
            Estamos trabajando con un número limitado de eventos para afinar el
            producto. Escríbenos y lo revisamos contigo.
          </p>
          <a
            href="mailto:hola@invibot.com?subject=Quiero%20probar%20Invibot"
            className="mt-9 inline-flex items-center justify-center rounded-full bg-gold px-7 py-3.5 text-sm font-medium text-night transition-colors hover:bg-gold-soft"
          >
            hola@invibot.com
          </a>
        </div>
      </section>
    </SiteShell>
  );
}
