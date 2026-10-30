import { SiteShell } from "@/components/site-chrome";
import { Phone, type Line } from "@/components/chat";
import { getSettings } from "@/lib/site/settings";
import { free, included, methods, priceLabels } from "@/lib/billing/pricing";

// The price is set in the admin and read on every visit, so changing it there
// changes it here without a deploy.
export const dynamic = "force-dynamic";

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
    text: "¡Qué gusto, María! Soy Aura y ya quedaron registrados los dos. Te mando la ubicación unos días antes.",
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
    body: "Si la respuesta no está en la información de tu evento, Aura te pregunta a ti antes de contestar. Y aprende la respuesta para la próxima.",
  },
  {
    title: "Tu lista, siempre al día",
    body: "Quién confirmó, con cuántos acompañantes, quién falta por responder y quién no podrá llegar.",
  },
];

export default async function Home() {
  const settings = await getSettings();
  const price = priceLabels(settings);
  // Straight to signup whenever anyone can get in — open, or with a code the
  // signup page asks for. Only a closed site sends people to write to us.
  const startHref =
    settings.signupMode === "closed"
      ? "mailto:hello@invibot.com?subject=Quiero%20probar%20Invibot&body=Hola%2C%20me%20interesa%20probar%20Invibot.%0A%0ATipo%20de%20evento%3A%20%0AFecha%20aproximada%3A%20%0AN%C3%BAmero%20de%20invitados%3A%20"
      : "/registro";

  return (
    <SiteShell tone="night">
      <section className="px-6 pt-8 pb-20 sm:px-10 sm:pt-14">
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <p className="eyebrow !text-gold">Bienvenido</p>
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
              Envía las invitaciones por WhatsApp y deja que Aura, el asistente
              con inteligencia artificial de Invibot, administre las
              confirmaciones y responda las dudas de cada invitado. Tú sólo
              revisas las listas.
            </p>
            <p className="mt-4 leading-relaxed text-night-soft">
              Agrega a tus invitados tú mismo o comparte una liga de
              autorregistro que tú apruebas. Controla el acceso con códigos QR
              únicos por persona. Entre otras funciones diseñadas para elevar el
              control de tu evento.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href={startHref}
                className="inline-flex items-center justify-center rounded-full border border-gold px-8 py-3.5 text-sm font-medium tracking-wide text-gold transition-colors hover:bg-gold hover:text-night"
              >
                Crea tu evento
              </a>
              <p className="text-sm text-night-soft">
                {/* Only claims what is true: with a code or closed, it is not open to everyone. */}
                {settings.signupMode === "open" ? "Ya abierto al público." : "Estamos tomando los primeros eventos."}
              </p>
            </div>
          </div>

          {/* The thread is titled with the WhatsApp display name, as guests see
              it — "Aura de Invibot" has to be recognisable from this site for
              Meta to approve it. */}
          <Phone
            title="Aura de Invibot"
            subtitle="en línea"
            lines={heroThread}
            className="mx-auto lg:mx-0"
          />
        </div>
      </section>

      <section className="bg-cream px-6 py-24 sm:px-10 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow !text-cream-soft">Lo que no sabe, lo pregunta</p>
          <h2 className="mt-6 max-w-3xl font-display text-5xl leading-[1.05] tracking-tight text-cream-ink sm:text-6xl">
            Aura contesta las dudas de tus invitados. Y lo que no sabe, lo
            aprende de ti <em className="italic">una sola vez</em>.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-cream-soft">
            Te lo pregunta a ti por WhatsApp, le contesta a tu invitado con tus
            palabras y guarda la respuesta. El siguiente que pregunte lo mismo
            recibe la respuesta al instante, sin molestarte otra vez.
          </p>

          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:gap-16">
            <div>
              <p className="eyebrow !text-cream-soft mb-4">En el teléfono de tu invitada</p>
              <Phone title="Aura de Invibot" subtitle="en línea" lines={guestAsk} />
            </div>
            <div>
              <p className="eyebrow !text-cream-soft mb-4">En el tuyo</p>
              <Phone title="Aura de Invibot" subtitle="tu asistente" lines={organizerAsk} />
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

      <section id="costos" className="scroll-mt-8 px-6 pb-24 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <p className="eyebrow !text-gold">Costos</p>
          <h2 className="mt-6 max-w-3xl font-display text-5xl leading-[1.05] tracking-tight text-night-text sm:text-6xl">
            Armar tu evento es gratis. Sólo pagas cuando mandas{" "}
            <em className="italic">la invitación a tus invitados</em>.
          </h2>
          <p className="mt-5 text-lg text-night-soft">Sin costos ocultos ni cargos adicionales.</p>

          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-night-line bg-night-line lg:grid-cols-[1.1fr_1fr]">
            <div className="bg-night-raised p-8 sm:p-10">
              <p className="text-sm uppercase tracking-[0.2em] text-night-soft">Por invitado</p>
              <p className="mt-4 font-display text-8xl leading-none tracking-tight text-gold sm:text-9xl">
                {price.perGuest}
              </p>
              <p className="mt-4 text-night-soft">{price.currency} · IVA incluido · un solo pago por evento</p>
              <ul className="mt-8 space-y-3">
                {included.map((item) => (
                  <li key={item} className="flex gap-3 text-night-text">
                    <span aria-hidden className="text-gold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col justify-between gap-10 bg-night-surface p-8 sm:p-10">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-night-soft">Siempre gratis</p>
                <ul className="mt-5 space-y-2.5 text-night-soft">
                  {free.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-night-line pt-6">
                <p className="font-display text-3xl leading-tight text-night-text">
                  Una boda de {price.example.guests} invitados: {price.example.total}.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-night-soft">
                  Pagas cuando vas a enviar las invitaciones, por los invitados que todavía no tienen lugar. Si
                  agregas más después, pagas sólo esos. Compra mínima de {price.minimum} ({price.minimumTotal}).{" "}
                  {methods}. ¿Tienes un código de cortesía? Lo usas en ese mismo paso.
                </p>
                <a
                  href="/registro"
                  className="mt-7 inline-flex items-center justify-center rounded-full border border-gold px-8 py-3.5 text-sm font-medium tracking-wide text-gold transition-colors hover:bg-gold hover:text-night"
                >
                  Crear mi evento gratis
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-cream px-6 py-24 sm:px-10 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-5xl leading-[1.05] tracking-tight text-cream-ink sm:text-6xl">
            ¿Tienes un <em className="italic">evento</em> cerca?
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-cream-soft">
            Estamos trabajando con un número limitado de eventos para afinar el
            producto. Escríbenos y lo revisamos contigo.
          </p>
          <a
            href="mailto:hello@invibot.com?subject=Quiero%20probar%20Invibot"
            className="mt-9 inline-flex items-center justify-center rounded-full border border-cream-ink px-8 py-3.5 text-sm font-medium tracking-wide text-cream-ink transition-colors hover:bg-cream-ink hover:text-cream"
          >
            hello@invibot.com
          </a>
        </div>
      </section>
    </SiteShell>
  );
}
