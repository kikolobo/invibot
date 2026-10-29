import { requireStaff } from "@/lib/auth/session";
import { setStripeMethod, setupStripeWebhook } from "@/lib/admin/actions";
import { anthropicConnector } from "@/lib/connectors/anthropic";
import { stripeConnector } from "@/lib/connectors/stripe";
import { whatsappConnector } from "@/lib/connectors/whatsapp";
import { AdminForm } from "../admin-form";
import { formatDateTime } from "../format";
import { Breakdown, Panel, Stat, StatGrid, formatMoney, formatNumber, formatUsd, percent } from "../ui";

export const metadata = { title: "Conectores" };

// Read live from Meta, Anthropic and Stripe on every visit.
export const dynamic = "force-dynamic";

const quality: Record<string, string> = { GREEN: "Alta", YELLOW: "Media", RED: "Baja", UNKNOWN: "Sin datos" };
const tiers: Record<string, string> = {
  TIER_50: "50 por día",
  TIER_250: "250 por día",
  TIER_1K: "1,000 por día",
  TIER_10K: "10,000 por día",
  TIER_100K: "100,000 por día",
  TIER_UNLIMITED: "Sin límite",
};
const templateStatus: Record<string, string> = {
  APPROVED: "Aprobada",
  PENDING: "En revisión",
  REJECTED: "Rechazada",
  PAUSED: "Pausada",
  DISABLED: "Desactivada",
};
const sources: Record<string, string> = {
  guest_reply: "Respuestas a invitados",
  simulator: "Simulador",
  name_split: "Separar nombres",
};

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full border px-3 py-0.5 text-[0.78rem] ${ok ? "border-line text-ink-soft" : "border-danger text-danger"}`}
    >
      {children}
    </span>
  );
}

/**
 * The outside services Invibot runs on, each read live: whether it is
 * connected, how it is doing, and — for Stripe — the switches we can flip
 * through its API instead of its dashboard. Secrets stay in the environment;
 * nothing here shows one.
 */
export default async function Conectores() {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const [whatsapp, anthropic, stripe] = await Promise.all([whatsappConnector(), anthropicConnector(), stripeConnector()]);
  const { traffic } = whatsapp;

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-6 py-12 sm:px-10">
      <div>
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Conectores</h1>
        <p className="mt-3 max-w-xl text-ink-soft">
          WhatsApp, Anthropic y Stripe, leídos en vivo. Las llaves viven en las variables del entorno y nunca se
          muestran aquí.
        </p>
      </div>

      {/* WhatsApp */}
      <Panel title="WhatsApp (Meta)">
        <StatGrid>
          <Stat label="Envíos 24 h" value={traffic.sends24} note={`${formatNumber(traffic.failed24)} fallidos`} alert={traffic.failed24 > 0} />
          <Stat
            label="Envíos 7 días"
            value={traffic.sends7}
            note={`${percent(traffic.delivered7, traffic.sends7 - traffic.failed7)} entregados · ${formatNumber(traffic.failed7)} fallidos`}
          />
          <Stat
            label="Recibidos 24 h"
            value={traffic.inbound24}
            note={traffic.lastInbound ? `Último ${formatDateTime(traffic.lastInbound)}` : "Ninguno"}
          />
          <Stat label="Números desconocidos" value={traffic.unmatched7} note="Mensajes en 7 días que no son de ningún invitado" />
        </StatGrid>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {whatsapp.numbers.map((number) => (
            <div key={number.profile} className="rounded-xl border border-line p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-xl text-ink">
                  {number.profile === "production" ? "Número real" : "Número de prueba"}
                </h3>
                {number.active && <Badge ok>Envía ahora</Badge>}
                {!number.configured && <Badge ok={false}>Sin configurar</Badge>}
              </div>
              {number.error && <p className="mt-3 text-[0.88rem] text-danger">Meta: {number.error}</p>}
              {number.number && (
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[0.88rem]">
                  <dt className="text-ink-muted">Número</dt>
                  <dd>{number.number.display ?? "—"}</dd>
                  <dt className="text-ink-muted">Nombre</dt>
                  <dd>
                    {number.number.verifiedName ?? "—"}
                    {number.number.nameStatus && <span className="text-ink-muted"> · {number.number.nameStatus}</span>}
                  </dd>
                  <dt className="text-ink-muted">Calidad</dt>
                  <dd className={number.number.quality === "RED" ? "text-danger" : ""}>
                    {quality[number.number.quality ?? ""] ?? number.number.quality ?? "—"}
                  </dd>
                  <dt className="text-ink-muted">Límite</dt>
                  <dd>{tiers[number.number.tier ?? ""] ?? number.number.tier ?? "—"}</dd>
                  <dt className="text-ink-muted">Estado</dt>
                  <dd>{number.number.status ?? "—"}</dd>
                  <dt className="text-ink-muted">IDs</dt>
                  <dd className="font-mono text-[0.78rem] text-ink-muted">
                    número {number.phoneNumberId} · WABA {number.wabaId ?? "—"}
                  </dd>
                </dl>
              )}
              {number.templatesError && <p className="mt-3 text-[0.85rem] text-danger">Plantillas: {number.templatesError}</p>}
              {number.templates && (
                <div className="mt-4">
                  <p className="text-[0.8rem] uppercase tracking-wide text-ink-muted">
                    Plantillas · {number.templates.filter((t) => t.status === "APPROVED").length} de {number.templates.length} aprobadas
                  </p>
                  <ul className="mt-2 space-y-1 text-[0.85rem]">
                    {number.templates.map((template) => (
                      <li key={template.name} className="flex justify-between gap-3">
                        <code className="text-ink">{template.name}</code>
                        <span className={template.status === "APPROVED" ? "text-ink-muted" : "text-danger"}>
                          {templateStatus[template.status] ?? template.status} · {template.category.toLowerCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {whatsapp.errors.length > 0 && (
          <div className="mt-8">
            <Breakdown
              head={["Errores de Meta, 7 días", "Veces"]}
              rows={whatsapp.errors.map((row) => [
                <span key="e">
                  <code className="text-[0.82rem]">{row.code ?? "sin código"}</code>
                  {row.title && <span className="block text-[0.8rem] text-ink-muted">{row.title}</span>}
                </span>,
                row.n,
              ])}
            />
          </div>
        )}
      </Panel>

      {/* Anthropic */}
      <Panel title="Anthropic (Claude)">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-[0.9rem]">
          {!anthropic.configured ? (
            <Badge ok={false}>Falta ANTHROPIC_API_KEY</Badge>
          ) : anthropic.check?.ok ? (
            <Badge ok>Conectado · {anthropic.check.name}</Badge>
          ) : (
            <Badge ok={false}>Error: {anthropic.check && !anthropic.check.ok ? anthropic.check.error : "sin respuesta"}</Badge>
          )}
          <span className="text-ink-muted">
            Modelo: <code>{anthropic.model}</code> (cámbialo con ANTHROPIC_MODEL)
          </span>
        </div>
        <StatGrid>
          <Stat label="Costo 24 h" value={formatUsd(anthropic.totals.cost24)} />
          <Stat label="Costo 30 días" value={formatUsd(anthropic.totals.cost30)} note={`${formatNumber(anthropic.totals.calls30)} llamadas`} />
          <Stat label="Por respuesta" value={formatUsd(anthropic.totals.avgReply)} note="Promedio a invitados" />
          <Stat
            label="Caché"
            value={percent(anthropic.totals.cacheRead, anthropic.totals.prompt)}
            note="Del prompt que se leyó de caché (más es más barato)"
          />
        </StatGrid>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <Breakdown
            head={["Día", "Llamadas", "Costo"]}
            empty="Sin consumo medido todavía."
            rows={anthropic.byDay.map((row) => [row.day, row.calls, formatUsd(row.cost)])}
          />
          <Breakdown
            head={["Uso", "Llamadas", "Costo"]}
            empty="—"
            rows={anthropic.bySource.map((row) => [sources[row.source] ?? row.source, row.calls, formatUsd(row.cost)])}
          />
          <Breakdown
            head={["Modelo", "Llamadas", "Costo"]}
            empty="—"
            rows={anthropic.byModel.map((row) => [<code key="m">{row.model}</code>, row.calls, formatUsd(row.cost)])}
          />
        </div>
      </Panel>

      {/* Stripe */}
      <Panel title="Stripe">
        {!stripe.configured[stripe.mode] ? (
          <p className="text-[0.9rem] text-ink-muted">
            Faltan las llaves de Stripe para el modo {stripe.mode === "live" ? "Live" : "Sandbox"}, que es el que
            está elegido en Configuración → Pagos.
          </p>
        ) : stripe.error ? (
          <p className="text-[0.9rem] text-danger">{stripe.error}</p>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-2 text-[0.9rem]">
              <Badge ok={stripe.mode === "live"}>{stripe.mode === "live" ? "Modo real" : "Modo de prueba"}</Badge>
              {stripe.account && (
                <>
                  <span className="text-ink">{stripe.account.name ?? stripe.account.id}</span>
                  <span className="text-ink-muted">
                    {stripe.account.country} · {stripe.account.currency?.toUpperCase()}
                  </span>
                  <Badge ok={stripe.account.chargesEnabled}>
                    {stripe.account.chargesEnabled ? "Cobros activos" : "Cobros desactivados"}
                  </Badge>
                  <Badge ok={stripe.account.payoutsEnabled}>
                    {stripe.account.payoutsEnabled ? "Depósitos activos" : "Depósitos desactivados"}
                  </Badge>
                  {stripe.account.pendingRequirements > 0 && (
                    <Badge ok={false}>{stripe.account.pendingRequirements} datos pendientes en Stripe</Badge>
                  )}
                </>
              )}
            </div>

            {stripe.balance && stripe.balance.length > 0 && (
              <StatGrid>
                {stripe.balance.map((row) => (
                  <Stat
                    key={row.currency}
                    label={`Saldo ${row.currency.toUpperCase()}`}
                    value={formatMoney(row.available, row.currency.toUpperCase())}
                    note={`${formatMoney(row.pending, row.currency.toUpperCase())} por llegar`}
                  />
                ))}
              </StatGrid>
            )}

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-line p-5">
                <h3 className="font-display text-xl text-ink">Webhook</h3>
                {stripe.webhook ? (
                  <p className="mt-2 text-[0.88rem] text-ink-soft">
                    <code className="break-all">{stripe.webhook.url}</code>
                    <span className="block text-ink-muted">
                      {stripe.webhook.status === "enabled" ? "Activo" : stripe.webhook.status}
                      {stripe.webhook.missingEvents.length > 0 && ` · le faltan ${stripe.webhook.missingEvents.length} eventos`}
                      {!stripe.webhook.secretStored && " · sin secreto guardado: los pagos no se acreditan"}
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 text-[0.88rem] text-danger">
                    No hay webhook: los pagos no se acreditarían.
                  </p>
                )}
                {isAdmin && (
                  <AdminForm
                    action={setupStripeWebhook}
                    submit={stripe.webhook ? "Revisar y reparar" : "Crear webhook"}
                    busy="Configurando…"
                    tone={stripe.webhook ? "quiet" : "default"}
                    className="mt-4 space-y-3"
                  />
                )}
              </div>

              <div className="rounded-xl border border-line p-5">
                <h3 className="font-display text-xl text-ink">Métodos de pago</h3>
                {stripe.methods ? (
                  <ul className="mt-3 space-y-3">
                    {stripe.methods.items.map((method) => (
                      <li key={method.key} className="flex flex-wrap items-center justify-between gap-3 text-[0.9rem]">
                        <span>
                          <span className="text-ink">{method.label}</span>
                          <span className="block text-[0.8rem] text-ink-muted">
                            {method.available
                              ? "Se ofrece en el pago"
                              : method.preference === "on"
                                ? "Encendido, pero Stripe todavía no lo habilita en la cuenta"
                                : "Apagado"}
                          </span>
                        </span>
                        {isAdmin && stripe.methods && (
                          <AdminForm
                            action={setStripeMethod}
                            submit={method.preference === "on" ? "Apagar" : "Encender"}
                            tone="quiet"
                            className="flex items-center gap-2"
                          >
                            <input type="hidden" name="method" value={method.key} />
                            <input type="hidden" name="configurationId" value={stripe.methods.configurationId} />
                            <input type="hidden" name="on" value={method.preference === "on" ? "false" : "true"} />
                          </AdminForm>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[0.88rem] text-ink-muted">La llave no puede leer los métodos de pago.</p>
                )}
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
