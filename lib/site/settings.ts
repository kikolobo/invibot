import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

export type SiteSettings = typeof siteSettings.$inferSelect;
export type SignupMode = SiteSettings["signupMode"];

export const signupModeLabels: Record<SignupMode, string> = {
  passcode: "Con código",
  open: "Abierto",
  closed: "Cerrado",
};

const DEFAULTS: SiteSettings = {
  id: "site",
  signupMode: "passcode",
  signupPasscode: null,
  maintenance: false,
  maintenanceMessage: null,
  defaultMaxEvents: null,
  defaultMaxGuestsPerEvent: null,
  pricePerGuestMinor: 1000,
  currency: "MXN",
  minimumSlots: 20,
  freeSimulatorTurns: 20,
  stripeWebhookId: null,
  stripeWebhookSecret: null,
  updatedAt: new Date(0),
  updatedByUserId: null,
};

/**
 * The one settings row, or the defaults while nobody has saved it yet — which
 * are exactly how the site behaved before this table existed.
 *
 * Per request, via `cache()`: a page and the actions behind it may ask several
 * times, and a request should see one consistent answer.
 */
export const getSettings = cache(async (): Promise<SiteSettings> => {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.id, "site") });
  return row ?? DEFAULTS;
});

/** The code in force: the saved one, or the environment's from before. */
export const activePasscode = (settings: SiteSettings): string | null =>
  settings.signupPasscode?.trim() || process.env.SIGNUP_PASSCODE?.trim() || null;

export async function saveSettings(
  changes: Partial<Omit<SiteSettings, "id" | "updatedAt">>,
  byUserId: string,
) {
  const values = { ...changes, updatedAt: new Date(), updatedByUserId: byUserId };
  await db
    .insert(siteSettings)
    .values({ id: "site", ...values })
    .onConflictDoUpdate({ target: siteSettings.id, set: values });
}
