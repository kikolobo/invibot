import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-chrome";
import { Phone, type Line } from "@/components/chat";
import { getSession } from "@/lib/auth/session";
import { GATE_COOKIE, gateOpen, gateConfigured } from "@/lib/auth/signup-gate";
import { getSettings } from "@/lib/site/settings";
import { priceLabels } from "@/lib/billing/pricing";
import { AuthForm } from "../auth-form";
import { PasscodeForm } from "./passcode-form";

export const metadata = { title: "Crear cuenta" };

/** What Aura does for them, in the four lines a host cares about. */
const promises = [
  "Manda tus invitaciones por WhatsApp",
  "Confirma a cada invitado, con sus acompañantes",
  "Resuelve sus dudas a cualquier hora, sin molestarte",
  "Mantiene tu lista al día, lista para la puerta",
];

/** A taste of it: the moment a guest says yes and asks something. */
const thread: Line[] = [
  { side: "out", time: "20:14", text: "¡Sí voy! ¿A qué hora empieza? 🎉" },
  {
    side: "in",
    time: "20:14",
    text: "¡Qué gusto, Lucía! Ya quedaste confirmada ✅ La ceremonia empieza a las 6:00 p. m.; te mando la ubicación unos días antes.",
  },
  { side: "out", time: "20:15", text: "¿Puedo llevar a mi hijo?" },
  {
    side: "in",
    time: "20:15",
    text: "Déjame preguntarle a los anfitriones y te confirmo en un momento 🙌",
  },
];

/**
 * The welcome. A host deciding whether to sign up should meet Aura before the
 * form — what she will do for them, round the clock — and then find the form
 * right beside it. The signup rules still decide what that card holds: the
 * form when signup is open, the code when it asks for one, a note when shut.
 */
export default async function Registro() {
  if (await getSession()) redirect("/eventos");

  const settings = await getSettings();
  if (settings.maintenance) redirect("/mantenimiento");

  const jar = await cookies();
  const open = await gateOpen(jar.get(GATE_COOKIE)?.value);
  const configured = await gateConfigured();
  const price = priceLabels(settings);

  return (
    <SiteShell tone="night">
      <section className="px-6 pt-8 pb-24 sm:px-10 sm:pt-14">
        <div className="mx-auto grid max-w-6xl items-start gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <p className="eyebrow !text-gold">Crea tu cuenta gratis</p>
            <h1 className="mt-6 text-night-text">
              <span className="block font-display text-5xl italic leading-[0.95] tracking-tight sm:text-7xl">
                Bienvenido a
              </span>
              <span className="-mt-1 block text-5xl font-semibold leading-[0.95] tracking-[-0.03em] sm:text-7xl">
                Invibot.
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-night-soft">
              Tu asistente virtual con inteligencia artificial que manda tus invitaciones, confirma a tus invitados y
              resuelve sus dudas de forma automática.
            </p>
            <p className="mt-4 max-w-xl leading-relaxed text-night-soft">
              <span className="font-medium text-gold">Aura</span> es tu asistente: estará{" "}
              <span className="text-night-text">24/7</span> a cargo de la logística y del contacto con tus invitados,
              para que tú sólo disfrutes tu evento.
            </p>

            <ul className="mt-9 space-y-3">
              {promises.map((item) => (
                <li key={item} className="flex gap-3 text-night-text">
                  <span aria-hidden className="text-gold">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            {/* Only where there is room beside the form; on a phone the form comes first. */}
            <Phone
              title="Aura de Invibot"
              subtitle="en línea"
              lines={thread}
              className="mt-12 hidden lg:block"
            />
          </div>

          <div className="lg:sticky lg:top-8">
            <div className="rounded-3xl border border-night-line bg-paper p-7 shadow-2xl shadow-black/40 sm:p-9">
              <h2 className="font-display text-3xl leading-tight text-ink">
                {open ? "Empieza en un minuto" : "Crear cuenta"}
              </h2>

              {open ? (
                <>
                  <p className="mt-2 leading-relaxed text-ink-soft">
                    Crea tu cuenta y arma tu primer evento hoy mismo, gratis.
                  </p>
                  <AuthForm mode="signup" />
                </>
              ) : (
                <>
                  <p className="mt-3 leading-relaxed text-ink-soft">
                    {configured
                      ? "Por ahora las cuentas son por invitación. Si tienes un código, escríbelo aquí."
                      : "Las cuentas están cerradas por el momento. Escríbenos a hello@invibot.com y te avisamos en cuanto abramos."}
                  </p>
                  {configured && <PasscodeForm />}
                </>
              )}
            </div>

            <p className="mt-5 text-center text-sm leading-relaxed text-night-soft">
              Armar tu evento es <span className="text-gold">gratis</span>. Pagas {price.perGuest} por invitado sólo
              cuando le envías su invitación.{" "}
              <span className="text-night-text">Todas las interacciones están incluidas en ese precio</span>: desde
              resolver sus dudas hasta los recordatorios y su pase de entrada.
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
