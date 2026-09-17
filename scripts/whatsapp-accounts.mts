/**
 * What Meta actually has, read-only.
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-accounts.mts
 *
 * Written for the switch from the test number to the live one. Three things
 * decide whether that switch is an env edit or a week of waiting, and none of
 * them can be answered from the repo:
 *
 *   1. Which WABA holds the live number — templates live on a WABA, not on the
 *      app, and they do not travel between them.
 *   2. Whether this token's system user reaches that WABA. If it does not,
 *      every call comes back as a bare "Authorization Error" (code 100) that
 *      names nothing.
 *   3. Whether that WABA is subscribed to our app. The subscription is
 *      per-WABA, so a number can send perfectly and still deliver no inbound
 *      webhook at all — which looks exactly like guests ignoring us.
 *
 * Touches nothing. Every call is a GET.
 */

import { whatsappConfig, PROFILES } from "@/lib/whatsapp/client";

const token = process.env.WHATSAPP_ACCESS_TOKEN;
if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN must be set");

const businessId = process.env.WHATSAPP_BUSINESS_ID;

const GRAPH = "https://graph.facebook.com/v21.0";

/** Graph replies are shaped differently per edge; we only read a few keys. */
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Never throws: a failed edge is a finding, not a crash. */
async function get(path: string, fields?: string): Promise<Json> {
  const url = `${GRAPH}/${path}${fields ? `?fields=${fields}&limit=100` : "?limit=100"}`;
  try {
    return (await fetch(url, { headers: { authorization: `Bearer ${token}` } }).then((r) =>
      r.json(),
    )) as Json;
  } catch (cause) {
    return { error: { message: cause instanceof Error ? cause.message : String(cause) } };
  }
}

const fail = (result: Json) => (result.error ? `✗ ${result.error.message}` : null);

async function describeWaba(id: string, label: string) {
  console.log(`\n── WABA ${id} ${label}`);

  const waba = await get(id, "id,name,account_review_status,message_template_namespace");
  const wabaError = fail(waba);
  if (wabaError) {
    console.log(`   ${wabaError}`);
    console.log("   → this token's system user probably has no role on this WABA");
    return;
  }
  console.log(`   name: ${waba.name}   review: ${waba.account_review_status ?? "?"}`);

  const numbers = await get(
    `${id}/phone_numbers`,
    "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type",
  );
  const numbersError = fail(numbers);
  if (numbersError) {
    console.log(`   phone numbers: ${numbersError}`);
  } else if ((numbers.data ?? []).length === 0) {
    console.log("   phone numbers: none attached");
  } else {
    for (const n of numbers.data) {
      console.log(
        `   phone ${n.id}  ${n.display_phone_number}  "${n.verified_name}"  ` +
          `quality=${n.quality_rating ?? "?"}  verified=${n.code_verification_status ?? "?"}  ` +
          `platform=${n.platform_type ?? "?"}`,
      );
    }
  }

  // The per-WABA webhook subscription. Empty here means inbound never arrives,
  // however healthy the number looks.
  const apps = await get(`${id}/subscribed_apps`);
  const appsError = fail(apps);
  if (appsError) {
    console.log(`   subscribed apps: ${appsError}`);
  } else {
    const list = (apps.data ?? []).map(
      (a: Json) => `${a.whatsapp_business_api_data?.name ?? "?"} (${a.whatsapp_business_api_data?.id ?? "?"})`,
    );
    console.log(`   subscribed apps: ${list.length ? list.join(", ") : "NONE — no inbound webhooks"}`);
  }

  const templates = await get(`${id}/message_templates`, "name,status,category,language");
  const templatesError = fail(templates);
  if (templatesError) {
    console.log(`   templates: ${templatesError}`);
    return;
  }
  const rows = (templates.data ?? []).filter((t: Json) => t.name !== "hello_world");
  if (rows.length === 0) {
    console.log("   templates: none (besides hello_world)");
    return;
  }
  const byStatus = new Map<string, string[]>();
  for (const t of rows) {
    byStatus.set(t.status, [...(byStatus.get(t.status) ?? []), t.name]);
  }
  console.log(`   templates: ${rows.length}`);
  for (const [status, names] of byStatus) {
    console.log(`     ${status.padEnd(10)} ${names.join(", ")}`);
  }
}

console.log("Business portfolio");
if (!businessId) {
  console.log("   WHATSAPP_BUSINESS_ID unset — skipping the portfolio listing");
} else {
  const owned = await get(`${businessId}/owned_whatsapp_business_accounts`, "id,name");
  const ownedError = fail(owned);
  console.log(
    ownedError
      ? `   ${businessId}: ${ownedError}`
      : `   ${businessId}: ${(owned.data ?? []).map((w: Json) => `${w.name} (${w.id})`).join(", ") || "no WABAs"}`,
  );
}

// Whatever the two profiles are pointed at, rather than a hardcoded list: the
// point of this script is to catch an env that points somewhere unexpected.
const seen = new Set<string>();
for (const profile of PROFILES) {
  const config = whatsappConfig(profile);
  if (!config?.wabaId || seen.has(config.wabaId)) continue;
  seen.add(config.wabaId);
  await describeWaba(config.wabaId, `← ${profile} profile`);
}

console.log("\n── Phone numbers by id");
for (const profile of PROFILES) {
  const config = whatsappConfig(profile);
  if (!config) {
    console.log(`   ${profile}: NOT CONFIGURED`);
    continue;
  }
  const id = config.phoneNumberId;
  const label = `← ${profile} profile`;
  const n = await get(id, "id,display_phone_number,verified_name,quality_rating,code_verification_status");
  const error = fail(n);
  console.log(
    error
      ? `   ${id} ${label}: ${error}`
      : `   ${id} ${label}: ${n.display_phone_number} "${n.verified_name}" quality=${n.quality_rating ?? "?"} verified=${n.code_verification_status ?? "?"}`,
  );
}

process.exit(0);
