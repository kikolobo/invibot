import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { updateSettings } from "@/lib/admin/actions";
import { activePasscode, getSettings, signupModeLabels, type SignupMode } from "@/lib/site/settings";
import {
  activeMode,
  configuredModes,
  pinnedMode,
  stripeKeys,
  stripeModeLabels,
  type StripeMode,
} from "@/lib/billing/stripe";
import { AdminForm, Field } from "../admin-form";
import { formatDateTime } from "../format";
import { Panel } from "../ui";

export const metadata = { title: "Configuración" };

const SIGNUP_MODES: { value: SignupMode; note: string }[] = [
  { value: "passcode", note: "Sólo quien tenga el código, o una invitación a organizar un evento." },
  { value: "open", note: "Cualquiera puede crear una cuenta en /registro, sin código." },
  { value: "closed", note: "Nadie se registra solo. Entran por invitación o los da de alta el staff." },
];

const TABS = [
  { key: "sitio", label: "Sitio" },
  { key: "pagos", label: "Pagos" },
  { key: "limites", label: "Límites" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const STRIPE_MODES: { value: StripeMode; note: string }[] = [
  { value: "test", note: "Pagos de prueba con tarjetas como 4242 4242 4242 4242. No se cobra dinero real." },
  { value: "live", note: "Pagos reales: lo que paguen los organizadores llega a tu cuenta de Stripe." },
];

/**
 * The site's switches, in tabs. Each tab is its own form and saves only what
 * it shows, so the log has one line per decision. Support sees how things
 * stand but changes nothing, and never sees the signup code.
 */
export default async function Configuracion({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const { tab: requested } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : "sitio";

  const settings = await getSettings();
  const mode = await activeMode();
  const ready = configuredModes();
  const code = activePasscode(settings);
  const fromEnv = !settings.signupPasscode && Boolean(code);
  const limit = (value: number | null) => (value === null ? "Sin límite" : String(value));
  const price = new Intl.NumberFormat("es-MX", { style: "currency", currency: settings.currency }).format(
    settings.pricePerGuestMinor / 100,
  );

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl space-y-10 px-6 py-12 sm:px-10">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Configuración</h1>
        <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-[0.9rem]">
          <dt className="text-ink-muted">Registro</dt>
          <dd>{signupModeLabels[settings.signupMode]}</dd>
          <dt className="text-ink-muted">Mantenimiento</dt>
          <dd>{settings.maintenance ? "Activo" : "No"}</dd>
          <dt className="text-ink-muted">Cobro</dt>
          <dd>{stripeModeLabels[mode]}</dd>
          <dt className="text-ink-muted">Precio por invitado</dt>
          <dd>
            {price} · mínimo {settings.minimumSlots}
          </dd>
          <dt className="text-ink-muted">Eventos por cuenta nueva</dt>
          <dd>{limit(settings.defaultMaxEvents)}</dd>
          <dt className="text-ink-muted">Invitados por evento</dt>
          <dd>{limit(settings.defaultMaxGuestsPerEvent)}</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Configuración</h1>
      {settings.updatedByUserId && (
        <p className="mt-3 text-[0.88rem] text-ink-muted">Guardada por última vez {formatDateTime(settings.updatedAt)}</p>
      )}

      <nav className="mt-8 flex gap-1 border-b border-line" aria-label="Secciones">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/configuracion?tab=${item.key}`}
            aria-current={item.key === tab ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[0.92rem] transition-colors ${
              item.key === tab ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "sitio" && (
        <AdminForm key="sitio" action={updateSettings} submit="Guardar" className="mt-10 space-y-10">
          <input type="hidden" name="section" value="sitio" />
          <Panel title="Registro de cuentas nuevas">
            <div className="space-y-3">
              {SIGNUP_MODES.map((option) => (
                <label key={option.value} className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="signupMode"
                    value={option.value}
                    defaultChecked={settings.signupMode === option.value}
                    className="mt-1"
                  />
                  <span>
                    <span className="text-ink">{signupModeLabels[option.value]}</span>
                    <span className="block text-[0.85rem] text-ink-muted">{option.note}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-8 max-w-sm">
              <p className="text-[0.9rem] text-ink-soft">
                Código actual:{" "}
                {code ? <code className="rounded bg-paper-deep px-2 py-0.5 text-ink">{code}</code> : "ninguno"}
                {fromEnv && (
                  <span className="block text-[0.8rem] text-ink-muted">
                    Viene de SIGNUP_PASSCODE; guarda uno aquí para manejarlo desde el admin.
                  </span>
                )}
              </p>
              <div className="mt-4">
                <Field
                  label="Código nuevo"
                  name="signupPasscode"
                  autoComplete="off"
                  minLength={6}
                  placeholder="Vacío para dejar el actual"
                  hint="Cambiarlo invalida el anterior al instante, incluso para quien ya lo había escrito y no terminó."
                />
              </div>
            </div>
          </Panel>

          <Panel
            title="Mantenimiento"
            note="Cierra la app de organizadores y el registro para todos menos el staff. Los invitados y el asistente de WhatsApp siguen funcionando, igual que los envíos programados."
          >
            <label className="flex items-center gap-3">
              <input type="checkbox" name="maintenance" defaultChecked={settings.maintenance} />
              <span className="text-ink">Sitio en mantenimiento</span>
            </label>
            <label className="mt-4 block max-w-lg">
              <span className="text-[0.9rem] text-ink-soft">Mensaje para los organizadores</span>
              <textarea
                name="maintenanceMessage"
                rows={3}
                defaultValue={settings.maintenanceMessage ?? ""}
                placeholder="Estamos haciendo mejoras en Invibot. Tus eventos siguen funcionando…"
                className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink"
              />
            </label>
          </Panel>
        </AdminForm>
      )}

      {tab === "pagos" && (
        <AdminForm key="pagos" action={updateSettings} submit="Guardar" className="mt-10 space-y-10">
          <input type="hidden" name="section" value="pagos" />
          <Panel
            title="Modo de cobro"
            note="Qué cuenta de Stripe recibe los pagos nuevos. Los pagos ya hechos se quedan con la suya: un reembolso siempre usa las llaves con las que se cobró."
          >
            <div className="space-y-3">
              {STRIPE_MODES.map((option) => {
                const keys = stripeKeys(option.value);
                return (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 ${ready[option.value] ? "" : "opacity-60"}`}
                  >
                    <input
                      type="radio"
                      name="stripeMode"
                      value={option.value}
                      defaultChecked={mode === option.value}
                      disabled={!ready[option.value]}
                      className="mt-1"
                    />
                    <span>
                      <span className="text-ink">{stripeModeLabels[option.value]}</span>
                      <span className="block text-[0.85rem] text-ink-muted">{option.note}</span>
                      <span className="mt-1 block text-[0.8rem] text-ink-muted">
                        {keys.secret ? "✓ llave secreta" : "✗ falta la llave secreta"} ·{" "}
                        {keys.publishable ? "✓ llave publicable" : "✗ falta la publicable (pago sin ventana)"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {pinnedMode() && (
              <p className="mt-4 rounded-lg border border-line bg-paper-deep px-4 py-3 text-[0.85rem] text-ink">
                En este entorno STRIPE_MODE fija el cobro en {stripeModeLabels[pinnedMode()!]}, sin importar lo que
                elijas aquí. Lo que guardes aplica al sitio real.
              </p>
            )}
            {settings.stripeMode === null && (
              <p className="mt-4 text-[0.82rem] text-ink-muted">
                Nadie lo ha elegido todavía: se usa Live si tiene llaves, si no Sandbox.
              </p>
            )}
          </Panel>

          <Panel
            title="Precio"
            note="Lo que paga un organizador por cada invitado, una sola vez, con IVA incluido. Cubre su invitación, confirmación, recordatorios, pase y las respuestas del asistente. Un cambio aplica a las compras siguientes; lo ya pagado no se toca."
          >
            <div className="grid max-w-lg gap-4 sm:grid-cols-3">
              <Field
                label={`Por invitado (${settings.currency})`}
                name="pricePerGuest"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                required
                defaultValue={(settings.pricePerGuestMinor / 100).toString()}
              />
              <Field
                label="Compra mínima (lugares)"
                name="minimumSlots"
                type="number"
                min={1}
                inputMode="numeric"
                required
                defaultValue={settings.minimumSlots}
              />
              <Field
                label="Simulador gratis (turnos)"
                name="freeSimulatorTurns"
                type="number"
                min={0}
                inputMode="numeric"
                required
                defaultValue={settings.freeSimulatorTurns}
              />
            </div>
          </Panel>
        </AdminForm>
      )}

      {tab === "limites" && (
        <AdminForm key="limites" action={updateSettings} submit="Guardar" className="mt-10 space-y-10">
          <input type="hidden" name="section" value="limites" />
          <Panel
            title="Límites para cuentas nuevas"
            note="Se copian a cada cuenta al crearse. Cambiarlos aquí no toca las cuentas que ya existen; ésas se ajustan una por una desde su página. Vacío es sin límite."
          >
            <div className="grid max-w-md gap-4 sm:grid-cols-2">
              <Field
                label="Eventos activos"
                name="defaultMaxEvents"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={settings.defaultMaxEvents ?? ""}
                placeholder="Sin límite"
              />
              <Field
                label="Invitados por evento"
                name="defaultMaxGuestsPerEvent"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={settings.defaultMaxGuestsPerEvent ?? ""}
                placeholder="Sin límite"
              />
            </div>
          </Panel>
        </AdminForm>
      )}
    </div>
  );
}
