import { whatsappConfig, activeProfile, type WhatsAppProfile } from "@/lib/whatsapp/client";

/**
 * Which WABA a template script talks to.
 *
 * Templates are approved per WABA, and we now have two: the test number's and
 * the live one's. Every script that reads or writes a template therefore has to
 * say which — running an edit against the wrong one is both a wasted daily
 * allowance and a template library quietly drifting apart.
 *
 *   --profile production    # the live number's WABA
 *   --profile test          # Meta's test number (the default)
 *
 * Without the flag it follows `WHATSAPP_PROFILE`, which itself defaults to
 * test. Whatever it resolves to gets printed before anything happens, because
 * the one thing worse than picking the wrong WABA is not noticing.
 */
export function wabaFromArgv(argv: string[] = process.argv): {
  profile: WhatsAppProfile;
  wabaId: string;
  token: string;
} {
  const inline = argv.find((a) => a.startsWith("--profile="))?.slice("--profile=".length);
  const positional = argv.includes("--profile") ? argv[argv.indexOf("--profile") + 1] : undefined;
  const named = (inline ?? positional)?.trim().toLowerCase();

  if (named && named !== "test" && named !== "production") {
    throw new Error(`Unknown --profile "${named}". Use "test" or "production".`);
  }

  const profile = (named as WhatsAppProfile | undefined) ?? activeProfile();
  const config = whatsappConfig(profile);

  if (!config) {
    throw new Error(
      `The ${profile} profile is not configured. Set WHATSAPP_${
        profile === "production" ? "PROD" : "TEST"
      }_PHONE_NUMBER_ID and an access token.`,
    );
  }
  if (!config.wabaId) {
    throw new Error(
      `The ${profile} profile has no WABA id. Set WHATSAPP_${
        profile === "production" ? "PROD" : "TEST"
      }_WABA_ID — templates live on a WABA, and sending credentials alone cannot reach them.`,
    );
  }

  console.log(`profile: ${profile}  ·  WABA ${config.wabaId}  ·  number ${config.phoneNumberId}\n`);
  return { profile, wabaId: config.wabaId, token: config.accessToken };
}
