const steps = [
  {
    n: "01",
    title: "Describe tu evento",
    body: "Fecha, lugar, código de vestimenta, si hay valet, qué pasa si llueve. Las respuestas se convierten en lo que el asistente sabrá contestar.",
  },
  {
    n: "02",
    title: "Elige tu diseño",
    body: "Una colección de invitaciones y save the dates hechos para bodas, XV años, cumpleaños y eventos corporativos. Se personalizan con los datos de tu evento.",
  },
  {
    n: "03",
    title: "Envía por WhatsApp",
    body: "Cada invitado recibe su invitación con su nombre. Confirma con un botón o simplemente contestando el mensaje.",
  },
  {
    n: "04",
    title: "Olvídate de perseguir confirmaciones",
    body: "El asistente registra quién va, cuántos lo acompañan y responde dudas. Lo que no sabe, te lo pregunta a ti y aprende la respuesta.",
  },
];

const features = [
  {
    title: "Responde en español",
    body: "«Ahí estaré», «voy con mi esposa», «al final no puedo». No hay formularios que llenar ni ligas que abrir a fuerza.",
  },
  {
    title: "Pregunta lo que no sabe",
    body: "Si un invitado pregunta algo que no está en tu información, te llega a ti por WhatsApp. Tu respuesta se reutiliza para quien pregunte lo mismo.",
  },
  {
    title: "Lista de invitados siempre al día",
    body: "Confirmados, pendientes y quienes no podrán asistir. Con acompañantes y restricciones alimentarias.",
  },
];

export default function Home() {
  return (
    <>
      <section className="px-6 pt-12 pb-20 sm:px-10 sm:pt-20">
        <div className="mx-auto max-w-3xl">
          <p className="eyebrow">En desarrollo · México</p>
          <h1 className="mt-5 font-display text-5xl leading-[1.05] tracking-tight text-ink sm:text-7xl">
            Invitaciones que
            <br />
            responden solas.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-soft">
            Crea la invitación de tu evento, envíala por WhatsApp y deja que un
            asistente confirme la asistencia y conteste las dudas de tus
            invitados. En español, a cualquier hora.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href="mailto:hola@invibot.com?subject=Quiero%20probar%20Invibot&body=Hola%2C%20me%20interesa%20probar%20Invibot.%0A%0ATipo%20de%20evento%3A%20%0AFecha%20aproximada%3A%20%0AN%C3%BAmero%20de%20invitados%3A%20"
              className="inline-flex items-center justify-center rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-paper transition-colors hover:bg-accent-soft"
            >
              Quiero probarlo
            </a>
            <p className="text-sm text-ink-muted">
              Estamos aceptando los primeros eventos de prueba.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-paper-deep px-6 py-20 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <p className="eyebrow">Cómo funciona</p>
          <div className="mt-10 grid gap-x-12 gap-y-12 sm:grid-cols-2">
            {steps.map((step) => (
              <div key={step.n}>
                <p className="font-display text-3xl text-accent">{step.n}</p>
                <h2 className="mt-3 font-display text-2xl text-ink">{step.title}</h2>
                <p className="mt-2.5 leading-relaxed text-ink-soft">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <p className="eyebrow">Qué lo hace distinto</p>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="border-t border-line pt-6">
                <h2 className="font-display text-2xl text-ink">{feature.title}</h2>
                <p className="mt-2.5 leading-relaxed text-ink-soft">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line px-6 py-20 sm:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
            ¿Tienes un evento cerca?
          </h2>
          <p className="mx-auto mt-5 max-w-xl leading-relaxed text-ink-soft">
            Estamos trabajando con un número limitado de eventos para afinar el
            producto. Escríbenos y lo revisamos contigo.
          </p>
          <a
            href="mailto:hola@invibot.com?subject=Quiero%20probar%20Invibot"
            className="mt-9 inline-flex items-center justify-center rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-paper transition-colors hover:bg-accent-soft"
          >
            hola@invibot.com
          </a>
        </div>
      </section>
    </>
  );
}
