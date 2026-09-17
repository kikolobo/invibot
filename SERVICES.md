# External services

Inventory of every third-party service Invibot depends on: what it does, who
owns the account, what it costs, and what breaks without it.

No secrets here — only the *names* of environment variables. Values live in
`.env.local` (never committed) and in the Vercel project settings.

Last reviewed: 2026-09-17

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

  | Name                            | Purpose                                              |
  | ------------------------------- | ---------------------------------------------------- |
  | `DATABASE_URL`                  | Neon pooled connection string                        |
  | `BETTER_AUTH_SECRET`            | Signs session cookies. Distinct from local           |
  | `BETTER_AUTH_URL`               | `https://invibot.com`                                |
  | `WHATSAPP_PROFILE`              | `test` or `production`. Unset means test             |
  | `WHATSAPP_TEST_PHONE_NUMBER_ID` | Meta's test number. No trailing space — it cost a day |
  | `WHATSAPP_TEST_WABA_ID`         | The test WABA, where today's 8 templates live        |
  | `WHATSAPP_PROD_PHONE_NUMBER_ID` | The live number                                      |
  | `WHATSAPP_PROD_WABA_ID`         | The live WABA. A *separate* template library         |
  | `WHATSAPP_ACCESS_TOKEN`         | System user token, never expires. Covers both WABAs  |
  | `WHATSAPP_APP_SECRET`           | Verifies webhook signatures. One app, so shared      |
  | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Meta's subscription handshake. Shared                |
  | `R2_ACCOUNT_ID`                 | Cloudflare account                                   |
  | `R2_ACCESS_KEY_ID`              | R2 credentials                                       |
  | `R2_SECRET_ACCESS_KEY`          | R2 credentials                                       |
  | `R2_BUCKET`                     | `invibot`                                            |
  | `ANTHROPIC_API_KEY`             | The guest assistant                                  |
  | `ANTHROPIC_MODEL`               | Optional override; defaults to `claude-opus-5`       |
  | `GOOGLE_MAPS_API_KEY`           | Optional, **not set**. See Google Maps below         |
  | `INVIBOT_PUBLIC_URL`            | Optional override for guest-facing short links       |

- `/api/health` reports which of these are set and their character counts —
  never the values. It is the only way to compare a Vercel secret against
  `.env.local`, since Vercel will not read a secret back.

- **⚠️ Environment variable changes need a redeploy.** They are not applied to
  an existing deployment.
- **⚠️ Deployment Protection is off** so the public site is reachable. Turning
  it on hides the site from Meta's reviewer and from guests.

### Neon — Postgres

The database. 24 tables, 14 migrations applied.

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

**In use.** Answers guests on WhatsApp, records RSVPs, and escalates what the
organizer never answered.

- **Console:** https://console.anthropic.com
- **Model:** `claude-opus-5` at `effort: low`, overridable with
  `ANTHROPIC_MODEL`. Four tools — confirm, decline, opt out, escalate — plus
  `send_location` on events that have coordinates.
- **Prompt caching** carries the system prefix: the event's facts are identical
  for every guest, so watch `cache_read_input_tokens` after any prompt edit. A
  prefix under the model's minimum silently caches nothing.
- **Cost:** roughly **$0.80 per event** — about 5% of what WhatsApp charges for
  the same event. Not the lever worth optimizing.
- **Regression suite:** `npm run eval:agent` (14 cases, real API calls, cents
  per run). Run it before and after every prompt change.
- **Env var:** `ANTHROPIC_API_KEY`

---

### Meta / WhatsApp Business Platform — **the channel**

**In use**, on Meta's test number with allow-listed recipients. The live number
is configured alongside it and not yet switched on — see "Two numbers" below.

- **Consoles:** https://business.facebook.com (business account),
  https://developers.facebook.com (the app)
- **Cost:** per-message, paid to Meta directly. This is ~90% of variable cost
  and therefore the thing pricing must be built around.
- **Status:** sending and receiving. Eight approved templates; the app answers
  webhooks, matches inbound numbers, and holds the 24-hour window rule.
- **⚠️ Templates:** approved ones **can** be edited — once per 24 hours, ten
  times a month — but the edit re-enters review, and a template in review
  cannot be sent (error `132001`). Never start one mid-campaign.
  `scripts/whatsapp-template-status.mts` shows where each one stands;
  `scripts/update-whatsapp-templates.mts` sends footer edits;
  `scripts/sync-whatsapp-templates.mts` creates what is missing.
- **⚠️ Recipients:** send to the canonical `+52…`, never the `521…` wa_id Meta
  puts in webhooks. The test number also needs each recipient allow-listed in
  the dashboard.
- **⚠️ A bare "Authorization Error" (code 100)** means either the token's system
  user has no WABA assigned, or that environment holds a different token.
  Compare character counts in `/api/health` before re-diagnosing anything.
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
- **Two numbers, one selected.** `WHATSAPP_PROFILE` picks between `test` and
  `production`; both credential sets stay in the environment. Unset means
  `test`, deliberately — a deployment that forgets lands on the number that can
  only reach allow-listed phones and costs nothing, instead of the one that
  bills real conversations. `/api/health` prints which is live.

  | | test | production |
  | --- | --- | --- |
  | Number | `+1 555-074-3275` (Meta's) | `+1 619-304-5456` |
  | Phone number id | `140921972434962` | `135995746264538` |
  | WABA | `126496910555795` Test | `154263271092631` Movic's InviBot |
  | Templates | 8 approved | 8 submitted 2026-09-17, in review |
  | Recipients | 5 allow-listed | anybody |

  Inbound is routed by `metadata.phone_number_id`, not by the profile: both
  numbers deliver to the same webhook, and a reply always goes out on the number
  the guest wrote to. A number matching neither profile is recorded and left
  unanswered.

- **⚠️ Templates do not cross WABAs.** The eight approved templates exist only
  on the test WABA. The live WABA has none, so the production profile can open
  no conversation at all until they are created there and approved again.
  Every template script takes `--profile production` and prints which WABA it
  is about to touch.
- **⚠️ Media ids do not cross numbers.** A card or pass uploaded by one number
  is rejected by the other, and the failure is silent — the confirmation goes
  out and the image simply never arrives. `events.card_media_phone_number_id`
  records which number minted the cached handle so the other one re-uploads.
- **⚠️ The live WABA also delivers to Twilio.** It arrived subscribed to three
  Twilio apps and not to us; `InviBot` was subscribed on 2026-09-17, and
  Twilio's three are still there. A subscription can only be removed by the app
  that owns it, so those have to go from Twilio's own console.
  `scripts/whatsapp-subscribe-webhook.mts --profile production` shows and sets
  ours. The subscription is per-WABA and is the piece that is easy to forget:
  without it a number sends perfectly and delivers nothing inbound, which looks
  exactly like guests ignoring us.
- **Env vars:** see the Vercel table above.
- `scripts/whatsapp-accounts.mts` prints the whole picture read-only — every
  WABA in the portfolio, its numbers, its subscribed apps and its templates.
  Run it first whenever something about the channel looks wrong.
- Going direct to Meta rather than through a BSP — see "Considered and
  rejected" below.

### Cloudflare R2 — image storage

**In use.** Holds the invitation card the organizer uploads, which is sent to
each guest the moment they confirm.

- **Cost:** free tier to 10 GB; **no egress fees**.
- The bucket is **private**: nothing is served from a public R2 URL. Cards go to
  WhatsApp as an uploaded media id, and the organizer's own preview is proxied
  through `/api/eventos/[id]/card`. A card carries the venue and the date, and a
  public URL would publish both to anyone who guessed it.
- Media ids expire (Meta documents ~30 days), so the original has to stay here
  and be re-uploaded when a handle stops working.
- Signed with `aws4fetch` rather than the AWS SDK — one small dependency
  against forty.

---

## Planned, not yet set up

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

### Google Maps Platform — geocoding

**Decision pending, and it has teeth.** The native WhatsApp location needs real
coordinates, and today they are scraped out of the embed page Google serves for
an address — an undocumented shape that works now and can stop working without
warning, falling back to OpenStreetMap's Nominatim, which put one San Pedro
venue **818 metres** off.

- **Cost:** ~10k free geocoding calls a month; we make one per event save.
- **Env var:** `GOOGLE_MAPS_API_KEY`. The code already prefers it whenever it is
  present — nothing else has to change.
- Needs a billing-enabled Google Cloud project, which is the only reason it is
  not done.

### Nominatim (OpenStreetMap) — geocoding fallback

**In use**, with no account and no key. Their policy asks for an identifying
user agent — we send one — and caps volume well above one lookup per event
save. Accuracy on Mexican addresses is the weak point; see above.

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
