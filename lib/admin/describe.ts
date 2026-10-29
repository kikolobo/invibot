/**
 * One line saying what a staff action moved, for the activity log: money,
 * places, which Stripe, and why. Null when the entry carries none of that.
 */
export function describeDetail(detail: Record<string, unknown> | null | undefined): string | null {
  if (!detail) return null;
  const parts: string[] = [];
  const money = (value: number, currency = "MXN") =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value);
  // Payments carry `slots` and a sum (`amountMinor`, or pesos in `amount` for
  // a manual one); gifted places carry only `amount`, which is places.
  if (typeof detail.amountMinor === "number") {
    parts.push(money(detail.amountMinor / 100, typeof detail.currency === "string" ? detail.currency : "MXN"));
  } else if (typeof detail.amount === "number" && typeof detail.slots === "number") {
    parts.push(money(detail.amount));
  }
  if (typeof detail.slots === "number") parts.push(`${detail.slots} lugares`);
  else if (typeof detail.amount === "number") {
    parts.push(`${detail.amount > 0 ? "+" : ""}${detail.amount} lugares de regalo`);
  }
  const mode = detail.stripeMode;
  if (mode === "live") parts.push("Live, dinero real");
  else if (mode === "test") parts.push("Sandbox");
  else if (mode === "manual") parts.push("Manual");
  if (typeof detail.reason === "string" && detail.reason) parts.push(detail.reason);
  return parts.length ? parts.join(" · ") : null;
}
