import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSettings, type SiteSettings } from "@/lib/site/settings";

/** Where to buy more — opened from the connectors page and named in the alert. */
export const ANTHROPIC_BILLING_URL = "https://console.anthropic.com/settings/billing";
export const META_BILLING_URL = "https://business.facebook.com/billing_hub/payment_settings";

/** Meta's error for a send refused because the account's payment failed. */
export const META_PAYMENT_ERROR = "131042";

export type AnthropicBalance = {
  /** What the console showed, in US cents, and when; null until entered. */
  enteredCents: number | null;
  enteredAt: Date | null;
  /** Measured in `ai_usage` since then, in micro-dollars. */
  spentMicro: number;
  /** The estimate: entered minus spent, in US cents. */
  remainingCents: number | null;
  alertCents: number;
  low: boolean;
};

export async function anthropicBalance(settings?: SiteSettings): Promise<AnthropicBalance> {
  const s = settings ?? (await getSettings());
  if (s.anthropicBalanceCents === null || !s.anthropicBalanceAt) {
    return { enteredCents: null, enteredAt: null, spentMicro: 0, remainingCents: null, alertCents: s.anthropicAlertCents, low: false };
  }
  const [{ spent }] = (await db.execute(sql`
    select coalesce(sum(cost_micro_usd), 0)::bigint::float8 as spent
    -- As ISO text: postgres-js refuses a Date bound into a raw sql template.
    from ai_usage where created_at > ${s.anthropicBalanceAt.toISOString()}::timestamptz
  `)) as unknown as { spent: number }[];
  const remainingCents = Math.round(s.anthropicBalanceCents - spent / 10_000);
  return {
    enteredCents: s.anthropicBalanceCents,
    enteredAt: s.anthropicBalanceAt,
    spentMicro: spent,
    remainingCents,
    alertCents: s.anthropicAlertCents,
    low: remainingCents < s.anthropicAlertCents,
  };
}

export type WhatsAppSpend = {
  month: string;
  marketing: number;
  utility: number;
  /** Estimated at the configured rates, in US cents. */
  estimatedCents: number;
  budgetCents: number | null;
  over: boolean;
  /** Sends Meta refused for a payment problem in the last day. */
  paymentErrors: number;
};

/**
 * This month's paid WhatsApp traffic, priced at the rates in settings. Meta
 * charges per delivered template by category; service replies inside the
 * 24-hour window are free and are left out.
 */
export async function whatsappSpend(settings?: SiteSettings): Promise<WhatsAppSpend> {
  const s = settings ?? (await getSettings());
  const [row] = (await db.execute(sql`
    select
      to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM') as month,
      count(*) filter (where pricing_category = 'marketing' or (pricing_category is null and kind = 'invite'))::int as marketing,
      count(*) filter (where pricing_category = 'utility' or (pricing_category is null and kind <> 'invite'))::int as utility,
      (select count(*)::int from sends where status = 'failed' and error_code = ${META_PAYMENT_ERROR}
         and queued_at > now() - interval '24 hours') as "paymentErrors"
    from sends
    where channel = 'whatsapp' and template_name is not null and status <> 'failed'
      and date_trunc('month', queued_at at time zone 'America/Mexico_City')
        = date_trunc('month', now() at time zone 'America/Mexico_City')
  `)) as unknown as { month: string; marketing: number; utility: number; paymentErrors: number }[];

  const estimatedCents = Math.round(
    (row.marketing * s.whatsappMarketingMicroUsd + row.utility * s.whatsappUtilityMicroUsd) / 10_000,
  );
  return {
    month: row.month,
    marketing: row.marketing,
    utility: row.utility,
    estimatedCents,
    budgetCents: s.whatsappBudgetCents,
    over: s.whatsappBudgetCents !== null && estimatedCents >= s.whatsappBudgetCents * 0.8,
    paymentErrors: row.paymentErrors,
  };
}

export const usd = (cents: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD" }).format(cents / 100);
