process.loadEnvFile(".env.local");
const { default: Stripe } = await import("stripe");
for (const mode of ["TEST", "LIVE"]) {
  const key = process.env[`STRIPE_${mode}_SECRET_KEY`];
  if (!key) { console.log(`\n${mode}: sin llave`); continue; }
  const stripe = new Stripe(key);
  console.log(`\n== ${mode} ==`);
  const check = async (label: string, run: () => Promise<unknown>) => {
    try { const r = await run(); console.log("  ✓", label, r ?? ""); }
    catch (e) { const x = e as { type?: string; message?: string }; console.log("  ✗", label, "—", x.type === "StripePermissionError" ? "SIN PERMISO" : x.type, (x.message ?? "").slice(0, 90)); }
  };
  await check("Accounts (lectura)", async () => { const a = await stripe.accounts.retrieveCurrent(); return `${a.business_profile?.name ?? a.settings?.dashboard?.display_name ?? a.id} · ${a.country} · cobros ${a.charges_enabled ? "activos" : "inactivos"}`; });
  await check("Balance (lectura)", async () => { await stripe.balance.retrieve(); });
  await check("Customers", async () => { await stripe.customers.list({ limit: 1 }); });
  await check("Checkout Sessions", async () => { await stripe.checkout.sessions.list({ limit: 1 }); });
  await check("PaymentIntents (lectura)", async () => { await stripe.paymentIntents.list({ limit: 1 }); });
  await check("Refunds", async () => { await stripe.refunds.list({ limit: 1 }); });
  await check("Webhook Endpoints", async () => { const w = await stripe.webhookEndpoints.list({ limit: 10 }); return `${w.data.length} registrados`; });
  await check("Payment Method Configurations", async () => { const c = await stripe.paymentMethodConfigurations.list({ limit: 5 }); const d = c.data.find((x) => x.is_default) ?? c.data[0]; return d ? `tarjeta ${d.card?.available ? "sí" : "no"} · OXXO ${d.oxxo?.available ? "sí" : "no"} · SPEI ${d.customer_balance?.available ? "sí" : "no"}` : "ninguna"; });
}
for (const mode of ["TEST", "LIVE"]) {
  const pk = process.env[`STRIPE_${mode}_PUBLISHABLE_KEY`] ?? "";
  if (!pk) continue;
  // A publishable key can be checked without any secret: Stripe answers 401 to a bad one.
  const res = await fetch("https://api.stripe.com/v1/tokens", { method: "POST", headers: { authorization: `Bearer ${pk}` }, body: new URLSearchParams() });
  console.log(`\npublicable ${mode}:`, res.status === 401 ? "✗ Stripe no la reconoce (inválida o incompleta)" : `✓ Stripe la reconoce (respuesta ${res.status})`);
}
process.exit(0);
