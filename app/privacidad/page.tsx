import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aviso de privacidad",
  description:
    "Aviso de privacidad de Invibot conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.",
};

/**
 * BORRADOR — requiere revisión de un abogado antes de publicarse como definitivo.
 * Los campos entre corchetes deben completarse con los datos de la entidad legal.
 *
 * Cubre los elementos que exige el artículo 16 de la LFPDPPP: identidad y domicilio
 * del responsable, datos recabados, finalidades primarias y secundarias, medios para
 * limitar su uso, ejercicio de derechos ARCO, transferencias y cambios al aviso.
 */
export default function Privacidad() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
        Aviso de privacidad
      </h1>
      <p className="mt-4 text-sm text-ink-muted">
        Última actualización: septiembre de 2026
      </p>

      <div className="mt-10 space-y-8 leading-relaxed text-ink-soft">
        <section>
          <h2 className="font-display text-2xl text-ink">1. Responsable</h2>
          <p className="mt-3">
            [RAZÓN SOCIAL], con domicilio en [DOMICILIO FISCAL COMPLETO], es
            responsable del tratamiento de sus datos personales conforme a la Ley
            Federal de Protección de Datos Personales en Posesión de los
            Particulares (LFPDPPP) y su reglamento. Puede contactarnos en{" "}
            <a className="text-accent underline" href="mailto:privacidad@invibot.com">
              privacidad@invibot.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">2. Datos que recabamos</h2>
          <p className="mt-3">
            <strong className="text-ink">De organizadores:</strong> nombre, correo
            electrónico, número telefónico, y la información del evento que usted
            captura en la plataforma.
          </p>
          <p className="mt-3">
            <strong className="text-ink">De invitados:</strong> nombre, número
            telefónico, correo electrónico y las respuestas que envían, incluyendo
            confirmación de asistencia, número de acompañantes y restricciones
            alimentarias que decidan compartir.
          </p>
          <p className="mt-3">
            Los datos de los invitados son proporcionados por el organizador del
            evento. Respecto de esa información, Invibot actúa como encargado del
            tratamiento por cuenta del organizador, quien es el responsable de
            contar con el consentimiento de las personas que invita.
          </p>
          <p className="mt-3">
            No recabamos datos personales sensibles, salvo que usted decida
            compartir voluntariamente información alimentaria o de accesibilidad
            para su asistencia al evento.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">3. Finalidades</h2>
          <p className="mt-3">
            <strong className="text-ink">Primarias</strong>, necesarias para
            prestar el servicio: crear y administrar su cuenta; generar y enviar
            invitaciones por WhatsApp, SMS o correo electrónico; registrar y dar
            seguimiento a las confirmaciones de asistencia; responder preguntas
            sobre el evento; y comunicar al organizador las dudas que no podamos
            resolver.
          </p>
          <p className="mt-3">
            <strong className="text-ink">Secundarias</strong>, que puede rechazar
            sin que ello afecte el servicio: enviarle información sobre nuevas
            funciones del producto.
          </p>
          <p className="mt-3">
            Para oponerse a las finalidades secundarias, escriba a{" "}
            <a className="text-accent underline" href="mailto:privacidad@invibot.com">
              privacidad@invibot.com
            </a>
            . Los invitados pueden dejar de recibir mensajes en cualquier momento
            respondiendo <strong className="text-ink">BAJA</strong> por WhatsApp.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">4. Derechos ARCO</h2>
          <p className="mt-3">
            Usted puede acceder, rectificar, cancelar u oponerse al tratamiento de
            sus datos personales, así como revocar su consentimiento. Envíe su
            solicitud a{" "}
            <a className="text-accent underline" href="mailto:privacidad@invibot.com">
              privacidad@invibot.com
            </a>{" "}
            indicando su nombre, un medio de contacto, la descripción clara de los
            datos sobre los que busca ejercer el derecho y el documento que
            acredite su identidad. Responderemos en un plazo máximo de 20 días
            hábiles.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">5. Transferencias</h2>
          <p className="mt-3">
            No vendemos ni comercializamos sus datos personales. Los compartimos
            únicamente con proveedores que nos permiten operar el servicio, en la
            medida necesaria para ello: Meta Platforms (entrega de mensajes por
            WhatsApp), Anthropic (procesamiento de las conversaciones), y nuestros
            proveedores de alojamiento y base de datos. Estos proveedores pueden
            procesar información fuera de México, siempre sujetos a obligaciones
            de confidencialidad.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">6. Conservación</h2>
          <p className="mt-3">
            Conservamos la información de un evento mientras su cuenta esté
            activa. El organizador puede eliminar un evento y su lista de
            invitados en cualquier momento, lo que borra de forma permanente los
            datos asociados.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-ink">7. Cambios a este aviso</h2>
          <p className="mt-3">
            Cualquier modificación a este aviso se publicará en esta misma página,
            indicando la fecha de la última actualización. Si el cambio es
            sustancial, lo notificaremos por correo electrónico a los
            organizadores con cuenta activa.
          </p>
        </section>
      </div>
    </article>
  );
}
