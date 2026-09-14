import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Términos y condiciones de uso del servicio Invibot.",
};

/**
 * BORRADOR — requiere revisión de un abogado antes de publicarse como definitivo.
 * Los campos entre corchetes deben completarse con los datos de la entidad legal.
 */
export default function Terminos() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
        Términos y condiciones
      </h1>
      <p className="mt-4 text-sm text-ink-muted">
        Última actualización: septiembre de 2026
      </p>

      <div className="mt-10 space-y-8 leading-relaxed text-ink-soft">
        <section>
          <h2 className="font-display text-2xl text-ink">1. El servicio</h2>
          <p className="mt-3">
            Invibot, operado por [RAZÓN SOCIAL], permite crear invitaciones
            digitales, enviarlas a una lista de invitados por WhatsApp, SMS o
            correo electrónico, y administrar las confirmaciones de asistencia
            mediante un asistente automatizado. El servicio se encuentra en fase
            de desarrollo y sus funciones pueden cambiar.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">
            2. Responsabilidades del organizador
          </h2>
          <p className="mt-3">
            Al cargar una lista de invitados, usted declara que cuenta con una
            relación previa con esas personas y con su consentimiento para
            contactarlas con motivo del evento. Queda prohibido utilizar Invibot
            para enviar publicidad no solicitada, mensajes masivos a listas
            compradas o contenido ajeno a la invitación de un evento.
          </p>
          <p className="mt-3">
            El incumplimiento de lo anterior puede derivar en la suspensión
            inmediata de su cuenta, ya que pone en riesgo la operación del
            servicio para todos los usuarios.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">3. Asistente automatizado</h2>
          <p className="mt-3">
            Las respuestas a los invitados son generadas por un sistema
            automatizado a partir de la información que usted proporciona sobre el
            evento. Aunque procuramos que el asistente no invente respuestas y que
            escale a usted las preguntas que no pueda contestar, no garantizamos
            que sus respuestas estén libres de error. La información definitiva
            del evento es responsabilidad del organizador.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">4. Entrega de mensajes</h2>
          <p className="mt-3">
            La entrega de mensajes depende de plataformas de terceros, en
            particular WhatsApp. No controlamos ni garantizamos su disponibilidad,
            los tiempos de entrega, ni que un destinatario reciba o lea un
            mensaje. Recomendamos confirmar por otro medio la asistencia a eventos
            críticos.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">5. Contenido y diseños</h2>
          <p className="mt-3">
            Usted conserva la titularidad del contenido que carga, incluidas
            fotografías y textos, y nos otorga una licencia limitada para
            procesarlo con el fin de prestar el servicio. Las plantillas de diseño
            provistas por Invibot pueden usarse para sus eventos, pero no
            redistribuirse ni revenderse como plantillas.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">6. Precios</h2>
          <p className="mt-3">
            Durante la fase de prueba el servicio se ofrece sin costo. Cualquier
            esquema de precios futuro se comunicará con anticipación y no se
            aplicará a eventos ya creados y pagados.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">7. Limitación de responsabilidad</h2>
          <p className="mt-3">
            En la máxima medida permitida por la ley aplicable, la
            responsabilidad de [RAZÓN SOCIAL] derivada del uso del servicio se
            limita al monto pagado por usted en los tres meses anteriores al
            hecho que dé origen a la reclamación.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">8. Ley aplicable</h2>
          <p className="mt-3">
            Estos términos se rigen por la legislación de los Estados Unidos
            Mexicanos. Para su interpretación y cumplimiento, las partes se
            someten a la jurisdicción de los tribunales competentes de [CIUDAD],
            renunciando a cualquier otro fuero.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">9. Contacto</h2>
          <p className="mt-3">
            Dudas sobre estos términos:{" "}
            <a className="text-accent underline" href="mailto:hola@invibot.com">
              hola@invibot.com
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
