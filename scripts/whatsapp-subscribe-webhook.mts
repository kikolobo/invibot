import { wabaFromArgv } from "./whatsapp-profile.mjs";

/**
 * Subscribes our Meta app to a WABA's webhooks.
 *
 * The subscription is per-WABA, not per-app-per-number, and it is the piece
 * that is easy to forget: a number can send perfectly and still deliver
 * nothing inbound, which looks exactly like guests ignoring us. The live
 * number arrived subscribed to Twilio's apps and not to ours.
 *
 * Subscribes whichever app the access token belongs to — there is no app id to
 * pass, which also means this can only ever remove *our own* subscription, not
 * somebody else's. Twilio's have to go from Twilio's console.
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-subscribe-webhook.mts --profile production
 *   npx tsx --env-file=.env.local scripts/whatsapp-subscribe-webhook.mts --profile production --apply
 */
const { wabaId, token } = wabaFromArgv();
const GRAPH = "https://graph.facebook.com/v21.0";
const apply = process.argv.includes("--apply");

const auth = { authorization: `Bearer ${token}` };

const before = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, { headers: auth }).then((r) => r.json());
if (before.error) throw new Error(before.error.message);

const names = (before.data ?? []).map(
  (a: { whatsapp_business_api_data?: { name?: string; id?: string } }) =>
    `${a.whatsapp_business_api_data?.name ?? "?"} (${a.whatsapp_business_api_data?.id ?? "?"})`,
);
console.log(`currently subscribed: ${names.length ? names.join(", ") : "none"}`);

if (!apply) {
  console.log("\nwould subscribe this token's app. Re-run with --apply.");
  process.exit(0);
}

const result = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, { method: "POST", headers: auth })
  .then((r) => r.json());
if (result.error) throw new Error(result.error.message);
console.log(`subscribe: ${JSON.stringify(result)}`);

const after = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, { headers: auth }).then((r) => r.json());
console.log(
  `now subscribed: ${(after.data ?? [])
    .map((a: { whatsapp_business_api_data?: { name?: string; id?: string } }) =>
      `${a.whatsapp_business_api_data?.name ?? "?"} (${a.whatsapp_business_api_data?.id ?? "?"})`)
    .join(", ")}`,
);
process.exit(0);
