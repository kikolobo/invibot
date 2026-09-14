# External services

Inventory of every third-party service Invibot depends on: what it does, who
owns the account, what it costs, and what breaks without it.

No secrets here — only the *names* of environment variables. Values live in
`.env.local` (never committed) and in the Vercel project settings.

Last reviewed: 2026-09-14

---

## In use

### GoDaddy — domain registrar

Registrar for `invibot.com`. DNS is **not** served here; nameservers point at
Cloudflare.

- **Console:** https://dcc.godaddy.com/domains
- **⚠️ Expires 2026-10-05.** Auto-renew must be on. If this lapses, every
  guest invitation link breaks, email stops, and Meta business verification
  fails. This is the single cheapest catastrophic failure available to us.

### Cloudflare — DNS

Authoritative DNS for `invibot.com`. Nameservers `curt.ns.cloudflare.com` and
`sue.ns.cloudflare.com`.

- **Console:** https://dash.cloudflare.com
- **Cost:** free
- **Records:**

  | Type  | Name  | Value                                 | Proxy    |
  | ----- | ----- | ------------------------------------- | -------- |
  | A     | `@`   | `76.76.21.21`                         | DNS only |
  | CNAME | `www` | `e9b71ccd1defa75a.vercel-dns-017.com` | DNS only |

- **⚠️ Proxy must stay OFF (grey cloud).** Vercel terminates TLS itself;
  proxying causes HTTP 525 handshake failures and redirect loops. Cloudflare
  re-enables the proxy by default whenever a record is edited, so re-check the
  cloud icon after every change.

### GitHub — source control

- **Repo:** https://github.com/kikolobo/invibot (private)
- **Cost:** free
- **Auth:** SSH key, already configured locally
- Vercel deploys automatically on push to `main`.

### Vercel — hosting

Runs the Next.js app: the marketing site, the organizer app, and the auth API.

- **Console:** https://vercel.com
- **Cost:** Hobby (free) today. **Move to Pro before taking money** — Hobby's
  terms exclude commercial use.
- **Domains:** `invibot.com` (primary), `www.invibot.com`, `invibot.vercel.app`
- **Environment variables** (Production scope):

  | Name                 | Purpose                                    |
  | -------------------- | ------------------------------------------ |
  | `DATABASE_URL`       | Neon pooled connection string              |
  | `BETTER_AUTH_SECRET` | Signs session cookies. Distinct from local |
  | `BETTER_AUTH_URL`    | `https://invibot.com`                      |

- **⚠️ Environment variable changes need a redeploy.** They are not applied to
  an existing deployment.
- **⚠️ Deployment Protection is off** so the public site is reachable. Turning
  it on hides the site from Meta's reviewer and from guests.

### Neon — Postgres

The database. All 19 tables.

- **Console:** https://console.neon.tech
- **Project:** `sparkling-cake-18507188`, branch `production`
- **Region:** AWS `us-east-2`
- **Cost:** free tier
- Use the **pooled** endpoint (host contains `-pooler`); the client sets
  `prepare: false`, which pooled connections require.
- Migrations are Drizzle, in `db/migrations/`, applied with `npm run db:migrate`.
- **Note:** development and production currently share one database. Split them
  with a Neon branch before there is real customer data.

### Anthropic — the assistant

Not yet integrated; the decision is made and the budget is understood.

- **Console:** https://console.anthropic.com
- **Models:** Haiku 4.5 for guest conversations, Opus 5 for per-event work
  (intake structuring, art direction, copy)
- **Cost:** roughly **$0.80 per event** — about 5% of what WhatsApp charges for
  the same event. Not the lever worth optimizing.
- **Env var:** `ANTHROPIC_API_KEY` (not yet set)

---

## Planned, not yet set up

### Meta / WhatsApp Business Platform — **the critical path**

The messaging channel. Everything after milestone 2 waits on this.

- **Consoles:** https://business.facebook.com (business account),
  https://developers.facebook.com (the app)
- **Cost:** per-message, paid to Meta directly. This is ~90% of variable cost
  and therefore the thing pricing must be built around.
- **Status:** not started
- **⚠️ Business verification takes days to weeks.** Start before it is needed.
  Mexican entities need RFC, acta constitutiva, and proof of address, and the
  legal name must match the documents exactly.
- **⚠️ The production phone number must never have been registered on
  WhatsApp** — not a personal number, not one used in the WhatsApp Business
  app. A fresh prepaid SIM is the reliable option; VOIP numbers are frequently
  rejected. Once used for the Cloud API that number can never return to the
  normal WhatsApp app.
- Development works without verification: Meta provides a test number and up to
  5 verified recipients.
- **Env vars:** `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`,
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Going direct to Meta rather than through a BSP — see "Considered and
  rejected" below.

### Cloudflare R2 — image storage

Rendered invitation cards, in four formats each, plus per-guest personalised
versions.

- **Cost:** free tier to 10 GB; **no egress fees**, which matters because every
  guest loads an image.
- Chosen over Neon Object Storage for egress pricing, but that comparison
  should be re-run when we get there. `design_renders.r2Key` is just a string,
  so switching is cheap.

### Inngest — durable workflows

Campaign orchestration: send invitations, wait days, nudge at T-14/T-7/T-2,
close RSVPs, day-of logistics. Also serialises inbound webhooks per
conversation so a guest sending three messages does not produce three racing
agent runs.

- **Cost:** free tier is generous
- Not optional: campaigns run for weeks, and a cron job with a `status` column
  is how this project would die.

### Resend — email

Secondary channel, and the only way to offer password reset.

- **Cost:** free to 3k/month
- Requires DNS records in Cloudflare for DKIM/SPF.

### Cloudflare Email Routing — inbound email

Forwards `hola@invibot.com` and `privacidad@invibot.com` to a personal inbox.
Both appear on the public site and in the privacy notice, so they need to work.

- **Cost:** free
- **Status:** not set up — those addresses currently go nowhere.

### Stripe — payments

- **⚠️ Enable OXXO and SPEI.** Mexican customers frequently pay cash at OXXO
  or by bank transfer rather than by card.
- **Status:** not needed while the prototype is free.

### Sentry — error tracking

Add when there are users who can be affected by an error. Free tier.

---

## Considered and rejected

| Service                     | Why not                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Twilio** (WhatsApp)       | Per-message markup on top of Meta's rate. Our margin *is* the message cost, so a reseller's cut comes straight off every invitation, forever.     |
| **360dialog / other BSPs**  | 360dialog's flat fee + pass-through pricing is reasonable, but ~€49/month before the first customer is not. Revisit if Meta verification stalls. |
| **Wati / Gupshup**          | They sell an inbox UI — which is the part we are building.                                                                                        |
| **Supabase**                | Excellent, but we would use a fifth of it alongside Better Auth and R2.                                                                           |
| **Neon Auth**               | Would give real foreign keys to users. Rejected: auth is the worst thing to couple to a database vendor, and Better Auth has the org model we need for planner seats. |
| **Neon Functions**          | Redundant — Next.js on Vercel already provides serverless functions.                                                                              |
| **Neon AI Gateway**         | Adds a hop and a failure point in front of a single provider, and proxies can interfere with prompt caching — which is what makes a guest conversation cost $0.007 instead of $0.05. |
| **Self-hosted open-weight LLM** | Saves ~$0.55/event against ~$700–1,400/month of always-on GPU. Break-even is around 1,500 events/month, before counting ops time.             |
| **Google Maps Platform**    | Venue autocomplete is genuinely nicer, but a plain address field works for v1 and this avoids a billing-enabled Google Cloud project.             |
| **SMS as a channel**        | Near-irrelevant in Mexico. WhatsApp is the channel.                                                                                               |

---

## Recurring costs today

| Service   | Cost                       |
| --------- | -------------------------- |
| GoDaddy   | ~$12/year (domain renewal) |
| Cloudflare| $0                         |
| GitHub    | $0                         |
| Vercel    | $0 (Hobby)                 |
| Neon      | $0 (free tier)             |
| **Total** | **~$12/year**              |

First real costs arrive with WhatsApp messages, which are per-event and should
be covered by per-event pricing from the first paying customer.
