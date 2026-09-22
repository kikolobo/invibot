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
  | `ASSISTANT_NAME`                | What the assistant calls itself. Defaults to `Aura` |
  | `GOOGLE_MAPS_API_KEY`           | Optional, **not set**. See Google Maps below         |
  | `INVIBOT_PUBLIC_URL`            | Optional override for guest-facing short links       |

- `/api/health` reports which of these are set and their character counts —
  never the values. It is the only way to compare a Vercel secret against
  `.env.local`, since Vercel will not read a secret back.

- **⚠️ Environment variable changes need a redeploy.** They are not applied to
  an existing deployment.
- **⚠️ Hobby crons run once a day, and Vercel enforces it at deploy time.**
  Anything more frequent is refused outright — `*/15 * * * *` fails the build
  with "Hobby accounts are limited to daily cron jobs". The rejected deploy is
  harmless: production keeps serving the previous one. `vercel.json` therefore
  schedules `/api/cron/passes` at `0 16 * * *`, which is 10:00 in Monterrey.
  On Pro it becomes `*/15` and the QR delivery gap closes.
- `vercel.json` rejects unknown keys, including a `_comment`. Notes about a
  cron belong here, not in the file.
- **⚠️ Deployment Protection is off** so the public site is reachable. Turning
  it on hides the site from Meta's reviewer and from guests.

### Neon — Postgres

The database. 25 tables, 32 migrations applied.

- **Console:** https://console.neon.tech
- **Project:** `sparkling-cake-18507188`, branch `production`
- **Region:** AWS `us-east-2`
- **Cost:** free tier
- Use the **pooled** endpoint (host contains `-pooler`); the client sets
  `prepare: false`, which pooled connections require.
- Migrations are Drizzle, in `db/migrations/`, applied with `npm run db:migrate`.
- **Note:** development and production currently share one database. Split them
  with a Neon branch before there is real customer data.

#### Respaldos y cómo volver atrás

Dos capas, y la primera es la que se usa:

**1. Una rama de Neon.** Exacta, instantánea, del lado del servidor y sin bytes
en ningún disco: Neon la guarda por copia-en-escritura. Existe
`snapshot-2026-09-20` (`br-lucky-butterfly-a5ed6b7h`), verificada contra
producción tabla por tabla el día que se creó.

```
npx neonctl auth                              # una vez por máquina
npx neonctl branches create --project-id sparkling-cake-18507188 \
  --name snapshot-AAAA-MM-DD --parent production

# volver producción a ese estado, guardando el estado previo por si acaso
npx neonctl branches restore production br-lucky-butterfly-a5ed6b7h \
  --project-id sparkling-cake-18507188 --preserve-under-name antes-de-restaurar
```

También se puede restaurar a un instante exacto sin rama previa:
`branches restore production ^self@2026-09-21T01:00:00Z`. La restauración es de
toda la base, nunca de una tabla: para rescatar unos renglones, léelos de la
rama y cópialos a mano.

⚠️ **Nada debe escribir en una rama snapshot.** Tiene su propio endpoint y
acepta escrituras; en cuanto algo escriba ahí deja de ser el retrato de ese día.

**2. Archivos, para el día que Neon no esté.** `scripts/backup-db.mts` escribe
un `.ndjson` por tabla más un `MANIFEST.json` (fecha, versión del servidor,
conteos y en qué migración se tomó), fuera del repositorio — por omisión en
`~/Documents/Development/Backups/invibot/<fecha>`.

```
npx tsx scripts/backup-db.mts
npx tsx scripts/restore-db.mts --from <carpeta>            # ensayo, no toca nada
npx tsx scripts/restore-db.mts --from <carpeta> --apply    # sobre DATABASE_URL
```

`restore-db.mts` no crea el esquema: eso son las migraciones, y el manifiesto
dice hasta cuál llegaba el respaldo. Vacía y recarga en orden de llaves
foráneas, calculado leyendo las llaves de verdad — una lista escrita a mano no
sobrevive a la siguiente migración.

**Está probado, no supuesto.** El 2026-09-20 se levantó un Postgres 18 local,
se replicaron las 32 migraciones, se restauró el respaldo ahí y se comparó
contra producción con una huella md5 del contenido de cada tabla:
**25/25 idénticas**, no sólo en número de filas.

⚠️ Esos archivos llevan nombres, teléfonos y todas las conversaciones de los
invitados, en claro. Viven fuera del repositorio a propósito.

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
  | Phone number id | `140921972434962` | `1317996261394909` |
  | WABA | `126496910555795` Test | `150259448162128` InviBot.com |
  | Templates | 8 approved | 8 submitted 2026-09-17 |
  | Recipients | 5 allow-listed | anybody |

  **The same physical number exists twice at Meta.** `135995746264538` on WABA
  `154263271092631` ("Movic's InviBot") is the abandoned Twilio-linked entry —
  it still reads `CONNECTED` and it is *not* the one to use. The live pair is
  the one in the table. Eight templates were created on the dead WABA before
  this was understood; they are harmless and can be ignored.

  Inbound is routed by `metadata.phone_number_id`, not by the profile: both
  numbers deliver to the same webhook, and a reply always goes out on the number
  the guest wrote to. A number matching neither profile is recorded and left
  unanswered.

- **⚠️ Templates do not cross WABAs.** A template is approved per WABA, so
  moving to a different WABA means creating all eight again and waiting for
  review again. Every template script takes `--profile production` and prints
  which WABA it is about to touch. Approval has twice taken an afternoon, not
  days — most of the eight land within the hour.
- **⚠️ A number must be *registered* to the app that sends from it.** Three
  distinct failures, in the order they were hit on 2026-09-17, each with a
  different fix:

  | Error | Means | Fix |
  | --- | --- | --- |
  | `(#200) You do not have the necessary permissions` | the number is registered to somebody else's app (a BSP's) | release it there, or attach the number to your own WABA |
  | `(#133010) Account not registered` | the number is on your WABA but never registered | `scripts/whatsapp-register-number.mts --profile production --pin NNNNNN --apply` |
  | `(#100) Cannot Create Certificate / two-factor authentication` | two-step verification is on for that number | turn it off in WhatsApp Manager — **there is no API for this** — then register |

  The probe that tells these apart without sending anything or billing a cent:
  POST a read receipt with a bogus wamid to `/{phone_number_id}/messages`.
  `131009` (invalid parameter) means the number can send; anything else is the
  real problem, named.
- **⚠️ Registering sets a two-step PIN that Meta will never show you again.**
  It is required to re-register the number anywhere later, and `is_pin_enabled`
  only says whether one exists, never which. It is not in this repo and must
  not be: it lives in the password manager, with a local copy in
  `SECRETS.local.md` — untracked, gitignored, and on one laptop only. If it is
  lost, two-step verification has to be turned off in WhatsApp Manager and the
  number registered again with a new one.
- **⚠️ `health_status` on a phone number describes the number, not your app's
  right to use it.** It read `can_send_message: AVAILABLE` at every level while
  every send was being rejected with `(#200)`. Trust the probe above instead.
- **⚠️ Media ids do not cross numbers.** A card or pass uploaded by one number
  is rejected by the other, and the failure is silent — the confirmation goes
  out and the image simply never arrives. `events.card_media_phone_number_id`
  records which number minted the cached handle so the other one re-uploads.
- **⚠️ Webhook subscription is per-WABA and easy to forget.** Without it a
  number sends perfectly and delivers nothing inbound, which looks exactly like
  guests ignoring us. `scripts/whatsapp-subscribe-webhook.mts --profile
  production` shows and sets ours. The live WABA `150259448162128` has `InviBot`
  and nothing else. The abandoned `154263271092631` still carries three Twilio
  apps; a subscription can only be removed by the app that owns it, so those
  would have to go from Twilio's own console — moot now that we do not use that
  WABA.
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

### Open-Meteo — weather

**In use.** Answers the assistant's `get_weather` tool: the venue's weather for
the event's hours (`lib/weather/forecast.ts`).

- **Cost:** free, no key — **for non-commercial use only**. Once Invibot
  charges, it needs a paid plan (or a switch of provider) before it breaks the
  terms.
- Two endpoints. `api.open-meteo.com` forecasts ~15 days out; past that it
  answers 400, and the assistant falls back to `archive-api.open-meteo.com`:
  the same hours over the last ten years, worded as «suele», never as a
  forecast.
- The ten archive requests go out in parallel and the free tier sometimes
  answers 429 to one of them; there is one retry, and anything still refused
  just narrows the average.
- The guest-facing wording rules (rain only when asked, never what happens to
  the event if it rains unless there is a covered area) live in
  `lib/agent/weather.ts`, not here.

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

Forwards `hello@invibot.com` to a personal inbox. It is the only address the
public site and the privacy notice use, so it needs to work.

- **Cost:** free
- **Status:** live. Set up under Compute & AI → Email Service → Email Routing.

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
