import { and, eq, inArray, isNotNull, isNull, max } from "drizzle-orm";
import { db } from "@/db";
import { organizers, siteSettings, users } from "@/db/schema";
import { getSettings, type SiteSettings } from "@/lib/site/settings";
import { sendTemplate, sendText, whatsappConfig } from "@/lib/whatsapp/client";
import { buildComponents } from "@/lib/whatsapp/templates";
import { variantsOf } from "@/lib/phone";
import { anthropicBalance, usd, whatsappSpend, ANTHROPIC_BILLING_URL, META_BILLING_URL } from "@/lib/connectors/balances";

/**
 * Warns Invibot's admins on WhatsApp when a service is about to stop them:
 * Anthropic credit running low, WhatsApp spend past 80% of the month's
 * budget, or Meta refusing sends for a payment problem.
 *
 * Each warning goes out once — until the balance is re-entered, the month
 * turns, or a day passes for payment errors — so the daily run does not
 * repeat itself every morning.
 */
export async function checkServiceAlerts(now = new Date()): Promise<number> {
  const settings = await getSettings();
  const [anthropic, whatsapp] = await Promise.all([anthropicBalance(settings), whatsappSpend(settings)]);
  const alerts: { title: string; detail: string; path: string; mark: Partial<SiteSettings> }[] = [];

  if (anthropic.low && anthropic.remainingCents !== null && !settings.anthropicAlertedAt) {
    alerts.push({
      title: "Quedan pocos créditos de Anthropic",
      detail: `Saldo estimado: ${usd(anthropic.remainingCents)}, por debajo del aviso de ${usd(anthropic.alertCents)}. Recarga en ${ANTHROPIC_BILLING_URL.replace("https://", "")}`,
      path: "/admin/conectores?tab=anthropic",
      mark: { anthropicAlertedAt: now },
    });
  }
  if (whatsapp.over && whatsapp.budgetCents !== null && settings.whatsappAlertedMonth !== whatsapp.month) {
    alerts.push({
      title: "WhatsApp cerca del presupuesto del mes",
      detail: `Gasto estimado: ${usd(whatsapp.estimatedCents)} de ${usd(whatsapp.budgetCents)}.`,
      path: "/admin/conectores?tab=whatsapp",
      mark: { whatsappAlertedMonth: whatsapp.month },
    });
  }
  const lastPayment = settings.whatsappPaymentAlertedAt?.getTime() ?? 0;
  if (whatsapp.paymentErrors > 0 && now.getTime() - lastPayment > 24 * 60 * 60 * 1000) {
    alerts.push({
      title: "Meta está rechazando envíos por un problema de pago",
      detail: `${whatsapp.paymentErrors} envíos rechazados en el último día. Revisa la tarjeta en ${META_BILLING_URL.replace("https://", "")}`,
      path: "/admin/conectores?tab=whatsapp",
      mark: { whatsappPaymentAlertedAt: now },
    });
  }
  if (!alerts.length) return 0;

  const admins = await db
    .select({ phone: users.phone, name: users.name })
    .from(users)
    .where(and(eq(users.role, "admin"), isNotNull(users.phone), eq(users.banned, false), isNull(users.deletedAt)));
  const config = whatsappConfig();
  if (!config || !admins.length) return 0;

  let sent = 0;
  for (const alert of alerts) {
    let delivered = false;
    for (const admin of admins) {
      if (!admin.phone) continue;
      if (await deliver(config, admin.phone, alert.title, alert.detail, alert.path)) delivered = true;
    }
    // Marked only once it reached somebody, so a failed send is tried again tomorrow.
    // Written straight to the row: a warning going out is not somebody
    // saving the settings, and must not show up as "guardada por última vez".
    if (delivered) {
      await db.update(siteSettings).set(alert.mark).where(eq(siteSettings.id, "site"));
      sent++;
    }
  }
  return sent;
}

/** Free-form inside their 24-hour window, the `aviso_admin` template outside it. */
async function deliver(
  config: NonNullable<ReturnType<typeof whatsappConfig>>,
  phone: string,
  title: string,
  detail: string,
  path: string,
): Promise<boolean> {
  const link = `invibot.com${path}`;
  const [{ last }] = await db
    .select({ last: max(organizers.lastInboundAt) })
    .from(organizers)
    // Any event where this admin is listed and wrote to us opens their window.
    .where(inArray(organizers.phoneE164, variantsOf(phone)));
  const windowOpen = Boolean(last && Date.now() - last.getTime() < 24 * 60 * 60 * 1000);

  const result = windowOpen
    ? await sendText(config, phone, `Aviso de Invibot: *${title}*\n\n${detail}\n\nRevísalo en el admin: ${link}`)
    : await sendTemplate(config, phone, "aviso_admin", "es_MX", buildComponents("aviso_admin", [title, detail, link]));
  if (!result.ok) console.error("[alerts] could not warn", phone, title, result);
  return result.ok;
}
