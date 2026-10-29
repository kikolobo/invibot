import { requireStaff } from "@/lib/auth/session";
import { updateSettings } from "@/lib/admin/actions";
import { activePasscode, getSettings, signupModeLabels, type SignupMode } from "@/lib/site/settings";
import { AdminForm, Field } from "../admin-form";
import { formatDateTime } from "../format";
import { Panel } from "../ui";

export const metadata = { title: "Configuración" };

const MODES: { value: SignupMode; note: string }[] = [
  { value: "passcode", note: "Sólo quien tenga el código, o una invitación a organizar un evento." },
  { value: "open", note: "Cualquiera puede crear una cuenta en /registro, sin código." },
  { value: "closed", note: "Nadie se registra solo. Entran por invitación o los da de alta el staff." },
];

/**
 * The site's switches. One form and one save, so the log has one line per
 * decision. Support sees how things stand but not the code itself.
 */
export default async function Configuracion() {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const settings = await getSettings();
  const code = activePasscode(settings);
  const fromEnv = !settings.signupPasscode && Boolean(code);

  const limit = (value: number | null) => (value === null ? "Sin límite" : String(value));

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl space-y-10 px-6 py-12 sm:px-10">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Configuración</h1>
        <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-[0.9rem]">
          <dt className="text-ink-muted">Registro</dt>
          <dd>{signupModeLabels[settings.signupMode]}</dd>
          <dt className="text-ink-muted">Mantenimiento</dt>
          <dd>{settings.maintenance ? "Activo" : "No"}</dd>
          <dt className="text-ink-muted">Eventos por cuenta nueva</dt>
          <dd>{limit(settings.defaultMaxEvents)}</dd>
          <dt className="text-ink-muted">Invitados por evento</dt>
          <dd>{limit(settings.defaultMaxGuestsPerEvent)}</dd>
          <dt className="text-ink-muted">Precio por invitado</dt>
          <dd>
            {new Intl.NumberFormat("es-MX", { style: "currency", currency: settings.currency }).format(
              settings.pricePerGuestMinor / 100,
            )}{" "}
            · mínimo {settings.minimumSlots}
          </dd>
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

      <AdminForm action={updateSettings} submit="Guardar configuración" className="mt-10 space-y-10">
        <Panel title="Registro de cuentas nuevas">
          <div className="space-y-3">
            {MODES.map((mode) => (
              <label key={mode.value} className="flex items-start gap-3">
                <input
                  type="radio"
                  name="signupMode"
                  value={mode.value}
                  defaultChecked={settings.signupMode === mode.value}
                  className="mt-1"
                />
                <span>
                  <span className="text-ink">{signupModeLabels[mode.value]}</span>
                  <span className="block text-[0.85rem] text-ink-muted">{mode.note}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-8 max-w-sm">
            <p className="text-[0.9rem] text-ink-soft">
              Código actual:{" "}
              {code ? <code className="rounded bg-paper-deep px-2 py-0.5 text-ink">{code}</code> : "ninguno"}
              {fromEnv && <span className="block text-[0.8rem] text-ink-muted">Viene de SIGNUP_PASSCODE; guarda uno aquí para manejarlo desde el admin.</span>}
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
    </div>
  );
}
