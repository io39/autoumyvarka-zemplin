# Deployment — Autoumyváreň Zemplín

Production deployment runbook for the walking-skeleton / first production cutover.
Written in English (per `CLAUDE.md`); only user-facing copy is Slovak. This document
is the operational source of truth for **how the app is deployed**; `architecture.md`
(§3 topology, §6 scheduler, §7 GDPR) is the source of truth for **why**.

> **Status:** draft. Items marked `TBD` await a decision — see
> [§9 Open decisions](#9-open-decisions). Fill them in before the first cutover.

> ✅ **Origin hardening: DONE (2026-08-19).** The VPS runs a **Cloudflare Tunnel**
> with **no open inbound ports**, and Access gates the hostname to selected identities
> — the preferred topology of §5.1/§5.2. This closes the earlier header-spoofing
> exposure: `lib/auth/identity.ts` trusts the **unsigned**
> `cf-access-authenticated-user-email` header, which was forgeable while the origin
> was directly reachable, and is now only reachable through the tunnel.
>
> Remaining defense-in-depth, in priority order:
> 1. **Rate-limit the two bypassed API paths** (§5.5) — they are the only unauthenticated
>    ingress.
> 2. Verify the signed `Cf-Access-Jwt-Assertion` JWT in-app, so the app stops trusting an
>    unsigned header even if the edge is ever misconfigured.

---

## 0. Topology recap

```
Internet ─► Cloudflare (Access + WAF) ─► Cloudflare Tunnel ─► VPS (EU)
                                                              ├─ Next.js 16 (Node 22, pnpm) — long-lived process
                                                              └─ cloudflared daemon
VPS ──────────────────────────────────► Supabase Cloud (EU, eu-central-1)
       supabase-js over HTTPS/WSS          Postgres · Realtime · pg_cron · pg_net · backups
```

- The VPS is **never** exposed publicly. The only ingress is the Cloudflare Tunnel;
  there is no open inbound port for the app. ✅ **In place as of 2026-08-19.**
- Cloudflare Access (Zero Trust) authenticates every request **except** the SMS-webhook
  paths (§5.3) and `/api/reminders` (§5.4), which carry their own shared secrets and
  should additionally be rate-limited (§5.5). The app does **authorization only**
  (role mapping).
- Supabase Cloud is reached **outbound** over HTTPS/WSS from the VPS.

**Test hostname:** `autoumyvarka.nightsun.sk` (current TEST deploy).
**Production hostname:** `TBD` (e.g. `rezervacie.<domena>.sk`).
**VPS host / provider:** `TBD` (e.g. Hetzner EU).
**Process manager:** `TBD` (recommended: systemd).

---

## 1. Prerequisites (one-time)

- A Cloudflare account with **Zero Trust (Access)** enabled and a domain on Cloudflare DNS.
- A Supabase account.
- An EU VPS (`TBD`) with SSH access, Ubuntu LTS.
- The Slovak SMS provider account — `TBD` (PRD §13#4 still open; prod runs the `fake`
  adapter until pinned, see §6).
- Locally: the repo, `pnpm` via corepack, the Supabase CLI (`pnpm supabase`).

---

## 2. Phase 1 — Supabase Cloud EU (database)

### 2.1 Create the project
1. New Supabase project, **region `eu-central-1` (Frankfurt)** — mandatory for GDPR
   data residency (architecture §7). Do not pick a non-EU region.
2. Record the database password somewhere safe (needed for `db push`).

### 2.2 Enable extensions
Dashboard → Database → Extensions, enable:
- `pg_cron` — the reminder scheduler (architecture §6).
- `pg_net` — outbound HTTP from the cron job to `/api/reminders`.
- `btree_gist` — required so migration `0006` can create the `orders_no_box_overlap`
  exclusion constraint during replay. That constraint is later **dropped in `0016`**
  (overlaps are now a soft app-level check), but `0006` still creates it on a fresh
  `db push`, so the extension must be present.
- `pg_trgm`, `unaccent` — fuzzy client/car search (migration `0002`).

> Migrations create the objects, but the **extensions must exist first**. Enabling
> them in the dashboard before `db push` avoids a failed migration.

### 2.3 Apply migrations
Run from **your own terminal** (CLI push is hook-blocked inside Claude Code sessions):
```bash
pnpm supabase link --project-ref <project-ref>
pnpm supabase db push        # applies all checked-in supabase/migrations/* not yet on Cloud
```
`db push` applies only migrations the linked project hasn't seen yet — re-running it after a
new migration lands is the normal deploy step (never `db reset --linked`).

> **Redeploy checklist (on every release that adds a migration):** push code to GitHub
> `main` **and** `supabase db push` the new migration to Cloud, **before/with** the Coolify
> redeploy — new app code that references a not-yet-applied column errors until the migration
> runs. Most recent: **`0013_client_soft_delete.sql`** then **`0014_client_hard_delete.sql`**.
> 0013 added `clients.deleted_at`; 0014 **drops it again** and switches the Odstrániť feature to a
> hard-delete cascade (adds the `delete_client_cascade` function, restores `search_clients`). If
> neither has reached Cloud yet they apply in sequence (add-then-drop — harmless). Push both with
> the redeploy; the new app code calls `delete_client_cascade` and no longer references
> `clients.deleted_at`.

### 2.4 Seed reference data  ⚠️ gotcha
`supabase/seed.sql` is **only** run by local `supabase db reset` — it is **not** run
by `db push`. Production therefore starts with empty reference tables. Run
**`supabase/seed.prod.sql`** (committed) **once** against Cloud after `db push`:
```bash
pnpm supabase db query --linked --file supabase/seed.prod.sql
# or via psql: psql "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" -f supabase/seed.prod.sql
```
It contains, vs. the dev `seed.sql`:
- **`services` + `service_prices`** — the catalog (copied verbatim from `seed.sql`).
- **`opening_hours`** — the 7 weekday rows (idempotent).
- **One manager bootstrap row** in `staff` — **edit the `CHANGE_ME@example.com`
  placeholder** to the real manager's Cloudflare-Access email before running (§4).

Deliberately **excluded**: the dev `staff`/`workers` fixtures (the manager adds
Zamestnanci in-app — PRD §13#7), and `sms_templates` (already seeded by migration
`0008_sms.sql` on `db push`).

> ⚠️ **Run once.** The catalog inserts have no `on conflict` guard, so re-running the
> whole file duplicates the catalog. The opening-hours and staff inserts are
> idempotent on their own.

### 2.5 Collect connection values
Settings → API (+ Database). These become the production env vars (§7):
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`
- JWT secret → `SUPABASE_JWT_SECRET`

### 2.6 Backups
Confirm automatic backup cadence + retention on the chosen plan (architecture §7,
PRD §14). Document the provider DPA for EU residency.

---

## 3. Phase 2 — VPS (app host)

### 3.1 Base setup
1. Ubuntu LTS, non-root deploy user, SSH-key only, firewall default-deny inbound
   (the tunnel makes inbound ports unnecessary).
2. Install **Node 22** (match `.nvmrc`), enable corepack (`corepack enable`), install
   `cloudflared`.

### 3.2 Build the app
```bash
git clone <repo> /opt/autoumyvaren && cd /opt/autoumyvaren
corepack pnpm install --frozen-lockfile
pnpm build
```

### 3.3 Run as a long-lived process (systemd — recommended)
The app listens on **`127.0.0.1:3000`** only (the tunnel connects to it locally).

`/etc/systemd/system/autoumyvaren.service` (`TBD` — finalize once host/paths known):
```ini
[Unit]
Description=Autoumyvaren Zemplin (Next.js)
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/autoumyvaren
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
EnvironmentFile=/etc/autoumyvaren/env      # the secret store (§7) — chmod 600, not in repo
ExecStart=/usr/bin/env pnpm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now autoumyvaren
```

> `NODE_ENV=production` is load-bearing: it hard-disables the dev auth shim
> (architecture §2.2). A missing Cloudflare identity header in production is then a
> deny, never a fallback to a dev identity.

---

## 4. Phase 3 — Identity → role mapping (real accounts) ⚠️ gotcha

The app maps the Cloudflare-Access email (`cf-access-authenticated-user-email`
header) to a role via the **`staff` table**. An email allowed by Access but **absent
from `staff` is denied**. After migrations + before first login, insert the real
accounts into Cloud `staff`:

- The manager email → `role = 'manazer'`.
- Any worker-login emails → `role = 'prevadzka'`.

These emails must match the Cloudflare Access policy (§5.2) exactly. The dev shim
(`DEV_AUTH_EMAIL` / `DEV_AUTH_ROLE`) stays **unset** in production.

> **Note (PRD §13#7):** login accounts (`staff`) and assignable workers (`workers`)
> are separate. To credit a person on an order, also add them as a **Zamestnanec**
> (a `workers` row) via the `/staff` UI — having a login does not make someone an
> assignable worker.

---

## 5. Phase 4 — Cloudflare Tunnel + Access

### 5.1 Tunnel
```bash
cloudflared tunnel login
cloudflared tunnel create autoumyvaren
# route the hostname to the local app:
cloudflared tunnel route dns autoumyvaren <hostname>      # TBD hostname
```
`~/.cloudflared/config.yml` (`TBD`):
```yaml
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/<tunnel-id>.json
ingress:
  - hostname: <hostname>          # TBD
    service: http://127.0.0.1:3000
  - service: http_status:404
```
Run `cloudflared` as its own systemd service (`cloudflared service install`).

### 5.2 Access (Zero Trust) — gate the whole site
- Create a **self-hosted Access application** covering the entire hostname.
- Policy: **Allow** = the manager + worker emails (IdP or one-time-PIN). These must
  match the `staff` rows from §4.
- **Session duration:** long, for the shared tablet (PRD §3). `TBD` — pick the value.

### 5.3 Access — bypass for the SMS webhooks ⚠️ critical
The SMS provider cannot authenticate through Access, so its callback paths need a
path-scoped **Bypass / public** policy. There are **two** routes, and the bypass must
cover both:

| Path | Secret carried as |
| --- | --- |
| `POST /api/sms/webhook` | `x-sms-webhook-secret` **header** |
| `POST /api/sms/webhook/bulkgate/<secret>` | **URL path segment** — BulkGate's callback cannot set custom headers |

A policy scoped to the bare `/api/sms/webhook` will **not** match the BulkGate route;
use a wildcard (`/api/sms/webhook/*`) or add a second policy. Both handlers
self-verify `SMS_WEBHOOK_SECRET` in-process (spec 07 §2.8) — that is their only gate.
Everything else stays behind Access.

⚠️ Because the BulkGate secret travels in the URL it lands in Cloudflare/proxy access
logs. Treat it as lower-grade than a header secret and rotate it if those logs are
shared; the blast radius is bounded — the route can only set a delivery status on an
`sms_messages` row that already exists.

**Verify** (a wrong secret is enough, and keeps the real one out of your logs):
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://<hostname>/api/sms/webhook/bulkgate/wrong -d '[]' -H 'content-type: application/json'
```
`401` = the request reached the app (bypass works). A `302` to `*.cloudflareaccess.com`
means Access is still intercepting; `404` means the route was never deployed.

### 5.4 Access — reaching `/api/reminders`  ✅ resolved: path bypass
The pg_cron job (§8) calls `https://<hostname>/api/reminders` via `pg_net`, so that
request also transits Cloudflare Access. **Decision: option (b)** — a path **Bypass**
policy on `/api/reminders`, relying solely on the in-handler `REMINDER_TRIGGER_SECRET`,
exactly like the SMS webhook. (The rejected alternative was an Access **service token**,
with Supabase sending `CF-Access-Client-Id`/`Secret` headers.)

⚠️ **This failure mode cost real debugging time — read it before trusting a green cron.**
Without the bypass, Access answers the cron's POST with a `302` to the login page.
`pg_net` **follows the redirect** and records the *login page's* status, so
`net._http_response` shows a healthy-looking **`200`** while the app never received
anything. A `200` there is therefore **not** evidence that reminders work. Verify from
outside instead:
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<hostname>/api/reminders \
  -H 'content-type: application/json' -d '{}'
```
`401` = the bypass works (our handler rejecting a missing secret). `302` = still gated.

### 5.5 Hardening the bypassed paths ⚠️ recommended
`/api/sms/webhook`, `/api/sms/webhook/bulkgate/*` and `/api/reminders` are the **only**
ingress that skips Access, so they deserve edge protection beyond their shared secrets.

**Do: rate limiting at the edge.** A Cloudflare **WAF rate-limiting rule** per path
(e.g. 60 requests/min per IP → block) stops brute-forcing of the secrets and keeps abuse
off the tunnel entirely. Set it well above real traffic: BulkGate posts one bulk DLR per
batch and pg_cron fires once a minute, so legitimate volume is tiny.

**Consider: source-IP allowlisting**, which is stricter than rate limiting — restrict
`/api/reminders` to the Supabase project's egress addresses and the BulkGate callback
path to their published ranges. Only do this if the provider documents stable ranges;
a silent change breaks delivery reports in a way that is tedious to diagnose.

**Do NOT bother with CORS.** CORS is a *browser* policy governing which origins may
**read** a response; BulkGate and `pg_net` are server-side HTTP clients that ignore it,
as does anyone with `curl`. It would add the appearance of protection and no substance.

**Already in place** (don't remove): both handlers verify a shared secret and return
`401` otherwise; the BulkGate route can only set a delivery status on an `sms_messages`
row that **already exists**; and `/api/reminders` is idempotent via `orders.reminded_at`,
so replaying it cannot double-send.

---

## 6. Phase 5 — SMS provider ✅ BulkGate

**Provider pinned: BulkGate** (Simple Transactional API, no SDK — plain `fetch` in
`lib/sms/provider.ts`). `SMS_PROVIDER=fake` remains the default everywhere except
production. Final Slovak **wording** is still open (PRD §13#4).

Per-environment setup:
1. Create a **separate BulkGate application for production.** `DELIVERY_URL` is
   configured *per application*, so sharing one with the test box would send
   production delivery reports to the test box.
2. Set `SMS_PROVIDER=bulkgate`, `SMS_PROVIDER_APP_ID`, `SMS_PROVIDER_API_KEY` (§7).
3. **Sender** — `SMS_SENDER_ID` + `SMS_SENDER_ID_VALUE`:
   - `gSystem` (default) = BulkGate's shared system number; cheapest, accepts replies.
   - `gText` + a name (≤11 chars, no diacritics) = alphanumeric sender; needs
     registration for SK and **cannot receive replies**.
   - `gProfile` + a numeric profile id = a portal-managed **Sender ID profile**;
     preferred, because the actual sender can then be changed per country in the
     portal with no redeploy. *(Test box uses `gProfile` / `19147`.)*
   - ⚠️ `sender_id` is sent on **every** call and defaults to `gSystem` when the env
     var is unset — leaving it blank does **not** defer to the application's portal
     default, it overrides it.
4. In the BulkGate portal set **DELIVERY_URL** to
   `https://<hostname>/api/sms/webhook/bulkgate/<SMS_WEBHOOK_SECRET>`, enable
   **"Bulk DLRs — bulk request"** (POST + JSON array; the GET/query-string form is
   rejected with a 400), and leave **"Report only when error occurs" OFF** — with it
   on, successful messages stay at `sent` forever.
5. **Never** set `SMS_FAKE_ALLOW_FAILURE` in production (a real customer number could
   trip the forced-failure path), and never run e2e with `SMS_PROVIDER=bulkgate` —
   the SMS suites dispatch for real.
6. Document the provider's DPA (only phone number + message leave the EU set — §7).

**Cost note:** ~0.788 credits/SMS looks alarming but is normal — BulkGate credits are
CZK: SK list €0.026 ≈ 0.65 CZK, +21 % CZ VAT ≈ 0.788, i.e. ~€0.031/SMS. The diacritics
stripping in `render.ts` is what keeps a message to **one** segment (GSM-7, 160 chars);
with diacritics the seeded ~72-char templates would be two.

---

## 7. Production environment variables

All live in the VPS secret store (`/etc/autoumyvaren/env`, `chmod 600`, referenced by
the systemd `EnvironmentFile`). **Never** in the repo or the build image (`CLAUDE.md`).
See `.env.example` for the documented full set.

| Variable | Production value | Source |
| --- | --- | --- |
| `NODE_ENV` | `production` | systemd |
| `NEXT_PUBLIC_SUPABASE_URL` | Cloud project URL | Supabase §2.5 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cloud `anon` key | Supabase §2.5 |
| `SUPABASE_SERVICE_ROLE_KEY` | Cloud `service_role` key | Supabase §2.5 (server-only) |
| `SUPABASE_JWT_SECRET` | Cloud JWT secret | Supabase §2.5 (mints Realtime JWT) |
| `SMS_PROVIDER` | `bulkgate` (§6) | you |
| `SMS_PROVIDER_APP_ID` | BulkGate application id | BulkGate portal |
| `SMS_PROVIDER_API_KEY` | BulkGate application token | BulkGate portal |
| `SMS_SENDER_ID` | `gSystem` \| `gText` \| `gProfile` (§6) | you |
| `SMS_SENDER_ID_VALUE` | sender name / profile id; unset for `gSystem` | you |
| `SMS_WEBHOOK_SECRET` | strong random; **also** the path segment in DELIVERY_URL (§6) | `openssl rand -hex 32` |
| `REMINDER_TRIGGER_SECRET` | strong random; **must equal** the `reminder_secret` Vault secret (§8) | `openssl rand -hex 32` |
| `DEV_AUTH_EMAIL` | **unset** | — |
| `DEV_AUTH_ROLE` | **unset** | — |

---

## 8. Phase 6 — Scheduled reminder (Supabase Vault)

Migration `0008_sms.sql` registers the `sms-reminders` job (every minute); migration
`0019_reminder_config_vault.sql` re-scheduled it to read its config from **Supabase
Vault**. While the config is missing the job exits with a NOTICE (no 401 noise).

> ⚠️ **Do not use `alter database ... set app.reminder_url`.** That was the original
> `0008` mechanism and it **cannot work on Supabase Cloud**: setting a custom `app.*`
> parameter requires superuser, the dashboard/CLI run as `postgres`, and
> `supabase_admin` cannot log in there. It fails with
> `ERROR: 42501: permission denied to set parameter "app.reminder_url"`. It works only
> locally, where you can act as `supabase_admin` — which is exactly why the gap went
> unnoticed. The GUCs are still honoured as a **fallback** for existing local stacks.

Run once per environment, against Cloud (SQL Editor is sufficient — no superuser needed):
```sql
select vault.create_secret('https://<hostname>/api/reminders', 'reminder_url');
select vault.create_secret('<REMINDER_TRIGGER_SECRET>',        'reminder_secret');
```
Rotate with:
```sql
select vault.update_secret(id, '<new value>')
  from vault.decrypted_secrets where name = 'reminder_secret';
```
- `<REMINDER_TRIGGER_SECRET>` must equal the env var (§7) **exactly** — a mismatch
  produces a silent 401 every minute.
- `/api/reminders` must be reachable through Access (§5.4).
- `alter database` settings apply only to **new** sessions; give pg_cron a minute.

**Verifying (read §5.4 first — `net._http_response` can lie).** A `200` there may be
the Cloudflare login page, not our handler. Confirm from outside with the real secret:
```bash
curl -s -X POST https://<hostname>/api/reminders \
  -H 'x-reminder-secret: <REMINDER_TRIGGER_SECRET>' \
  -H 'content-type: application/json' -d '{}'
```
`{"ok":true,"considered":N,"sent":…,"failed":…}` is the handler answering.
`considered:0` just means no order currently sits in the window.

**Testing a reminder end to end:** book an order **35–40 min out** and leave it
`vytvorená`. The handler only picks up orders whose start is in `now+30min ± 2min` — a
4-minute window the clock passes through once. An order created less than ~28 min
before its start never enters it. Marking it `hotová`, deleting, or moving it also
disqualifies it. The handler stamps `reminded_at` **before** dispatching (so a crash
can't spam the customer), which also means a failed send never auto-retries — clear it
with `update orders set reminded_at = null where id = '…';`.

The handler is idempotent (`orders.reminded_at`), so a duplicate cron fire is harmless.
**Lead time is 30 min, hardcoded** in `lib/sms/reminder-window.ts` (PRD open question).

---

## 9. Open decisions

These block a clean first cutover — resolve, then update the `TBD`s above.

1. **VPS provider + process manager** — host (e.g. Hetzner EU) and systemd vs pm2
   (recommended: systemd, §3.3). *(The test box runs Coolify/Nixpacks instead — §3.)*
2. **Production hostname** — drives the tunnel ingress (§5.1) and the reminder URL (§8).
3. **Access session duration** — the shared-tablet long session value (§5.2).
4. **Final Slovak SMS wording + signature** (PRD §13#4) — templates are still
   placeholders. Note messages arrive **without diacritics** (§6).

> Resolved: prod seeding now lives in `supabase/seed.prod.sql` (§2.4) — edit the
> manager-email placeholder and run it once.
> Resolved: **`/api/reminders` past Access** — path bypass, option (b) (§5.4).
> Resolved: **SMS provider** — BulkGate (§6).
> Resolved: **reminder cron config** — Supabase Vault, not GUCs (§8).

---

## 10. First-cutover checklist

- [ ] Supabase project in `eu-central-1`; extensions enabled (§2.2)
- [ ] `supabase db push` applied all migrations (§2.3)
- [ ] Reference data seeded to Cloud (services, opening hours, SMS templates) (§2.4)
- [ ] Real `staff` accounts inserted; emails match Access policy (§4)
- [ ] VPS built, systemd service up on `127.0.0.1:3000`, `NODE_ENV=production` (§3)
- [ ] All production env vars set in the secret store; dev shim vars unset (§7)
- [ ] Tunnel routes `<hostname>` → `127.0.0.1:3000` (§5.1)
- [ ] Access gates the whole site; manager/worker emails allowed; long tablet session (§5.2)
- [ ] Access **bypass** covering **both** `POST /api/sms/webhook` **and**
      `/api/sms/webhook/bulkgate/*` (§5.3) — verified: a wrong secret returns `401`,
      not a `302`
- [ ] Access **bypass** on `/api/reminders` (§5.4) — verified the same way
- [ ] Vault secrets `reminder_url` / `reminder_secret` created; `reminder_secret`
      equals `REMINDER_TRIGGER_SECRET` (§8)
- [ ] Separate **production** BulkGate application; DELIVERY_URL + "Bulk DLRs" on,
      "report only on error" off (§6)
- [ ] Reminder verified end to end: order 35–40 min out → SMS received
- [ ] Delivery report verified: an `sms_messages` row reaches `delivered` (§6)
- [ ] Smoke test: load calendar, create an order, verify Realtime update, check audit log
- [ ] Backups confirmed; provider DPA documented (§2.6, §7)
```
