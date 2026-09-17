import { whatsappConfig, activeProfile, type WhatsAppProfile } from "@/lib/whatsapp/client";

/**
 * Registers a phone number on the Cloud API, under the app this token belongs to.
 *
 * A number added to a WABA is not yet usable: it sits at `status: PENDING` and
 * every send comes back `(#133010) Account not registered`. Registering is what
 * binds it to *our* app — which is also why a number registered by somebody
 * else's app (a BSP's, say) answers `(#200)` instead, and has to be released on
 * their side first.
 *
 * The PIN becomes the number's two-step verification PIN and is needed again
 * for any later re-registration. If the number already has one from a previous
 * life, that existing PIN is the one to pass — a fresh one is rejected.
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-register-number.mts --profile production --pin 123456
 *   … --apply    to actually send it
 */
const argv = process.argv;
const flag = (name: string) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const positional = argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined;
  return (inline ?? positional)?.trim();
};

const named = flag("profile")?.toLowerCase();
if (named && named !== "test" && named !== "production") throw new Error(`Unknown --profile "${named}"`);
const profile = (named as WhatsAppProfile | undefined) ?? activeProfile();

const config = whatsappConfig(profile);
if (!config) throw new Error(`The ${profile} profile is not configured`);

const pin = flag("pin");
if (!pin || !/^\d{6}$/.test(pin)) throw new Error("--pin must be exactly 6 digits");

const apply = argv.includes("--apply");
const GRAPH = "https://graph.facebook.com/v21.0";
const auth = { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" };

console.log(`profile: ${profile}  ·  number ${config.phoneNumberId}  ·  WABA ${config.wabaId}\n`);

const before = await fetch(`${GRAPH}/${config.phoneNumberId}?fields=status,account_mode,code_verification_status`, {
  headers: auth,
}).then((r) => r.json());
console.log(`status before: ${before.error ? `✗ ${before.error.message}` : JSON.stringify(before)}`);

if (!apply) {
  console.log("\nwould register with the given PIN. Re-run with --apply.");
  process.exit(0);
}

const result = await fetch(`${GRAPH}/${config.phoneNumberId}/register`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ messaging_product: "whatsapp", pin }),
}).then((r) => r.json());

if (result.error) {
  console.log(`\n✗ register failed: (#${result.error.code}) ${result.error.message}`);
  if (result.error.error_data?.details) console.log(`  ${result.error.error_data.details}`);
  process.exit(1);
}
console.log(`register: ${JSON.stringify(result)}`);

const after = await fetch(`${GRAPH}/${config.phoneNumberId}?fields=status,account_mode,quality_rating`, {
  headers: auth,
}).then((r) => r.json());
console.log(`status after:  ${JSON.stringify(after)}`);
process.exit(0);
