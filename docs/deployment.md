# Deployment — Autoumyváreň Zemplín

Production deployment runbook for the walking-skeleton / first production cutover.
Written in English (per `CLAUDE.md`); only user-facing copy is Slovak. This document
is the operational source of truth for **how the app is deployed**; `architecture.md`
(§3 topology, §6 scheduler, §7 GDPR) is the source of truth for **why**.

> **Status:** draft. Items marked `TBD` await a decision — see
> [§9 Open decisions](#9-open-decisions). Fill them in before the first cutover.

> ⚠️ **Current environment is a TEST deploy** (Coolify on a shared VPS, Cloudflare
> proxy + Access, **no tunnel, no origin hardening**). The VPS origin (80/443) is
> directly reachable, so the edge-auth header (`cf-access-authenticated-user-email`,
> trusted unsigned by `lib/auth/identity.ts`) can be spoofed by connecting straight
> to the origin IP. **Use fake/test data only — no real client PII.** Before the
> real production deploy on a dedicated VPS, restore the secure topology: either the
> **Cloudflare Tunnel** (no open ports — preferred, §5.1) **or** firewall 80/443 to
> Cloudflare IP ranges **plus** Authenticated Origin Pulls (mTLS); and ideally
> verify the signed `Cf-Access-Jwt-Assertion` JWT in-app as defense-in-depth.

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
  there is no open inbound port for the app.
- Cloudflare Access (Zero Trust) authenticates every request **except** the single
  SMS-webhook path (§5.3). The app does **authorization only** (role mapping).
- Supabase Cloud is reached **outbound** over HTTPS/WSS from the VPS.

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
- `btree_gist` — the `orders_no_box_overlap` exclusion constraint (migration `0006`).
- `pg_trgm`, `unaccent` — fuzzy client/car search (migration `0002`).

> Migrations create the objects, but the **extensions must exist first**. Enabling
> them in the dashboard before `db push` avoids a failed migration.

### 2.3 Apply migrations
Run from **your own terminal** (CLI push is hook-blocked inside Claude Code sessions):
```bash
pnpm supabase link --project-ref <project-ref>
pnpm supabase db push        # applies supabase/migrations/0001 .. 0009
```

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

### 5.3 Access — bypass for the SMS webhook ⚠️ critical
`POST /api/sms/webhook` is the **one** path the SMS provider cannot authenticate
through Access. Add a path-scoped **Bypass / public** policy for it. The handler
self-verifies `SMS_WEBHOOK_SECRET` in-process (spec 07 §2.8) — that is its only gate.
Everything else stays behind Access.

### 5.4 Access — reaching `/api/reminders`  ⚠️ decision
The pg_cron job (§6) calls `https://<hostname>/api/reminders` via `pg_net`, so that
request also transits Cloudflare Access. Choose one (`TBD`, §9):
- **(a)** an Access **service token** for that path (Supabase sends the
  `CF-Access-Client-Id`/`Secret` headers), **plus** the in-handler
  `REMINDER_TRIGGER_SECRET`; or
- **(b)** a path **Bypass** policy on `/api/reminders`, relying solely on
  `REMINDER_TRIGGER_SECRET` (simpler; the secret is the only gate, like the webhook).

---

## 6. Phase 5 — SMS provider

Still open (PRD §13#4 — provider **and** final wording both TBD). Until pinned:
- Production runs `SMS_PROVIDER=fake` → sends nothing (safe).
- **Never** set `SMS_FAKE_ALLOW_FAILURE` in production (a real customer number could
  trip the forced-failure path).

When the provider is chosen:
1. Write the adapter in `lib/sms/provider.ts`; pin its SDK to an exact minor
   (architecture §9 — fast-moving dep).
2. Finalize the Slovak text in `sms_templates` (PRD §13#4).
3. Set `SMS_PROVIDER` + `SMS_PROVIDER_API_KEY`; share `SMS_WEBHOOK_SECRET` with the
   provider's delivery-callback config.
4. Document the provider's DPA (only phone number + message leave the EU set — §7).

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
| `SMS_PROVIDER` | `fake` until provider pinned (§6) | you |
| `SMS_PROVIDER_API_KEY` | provider key (empty for `fake`) | provider |
| `SMS_WEBHOOK_SECRET` | strong random; shared with provider | `openssl rand -hex 32` |
| `REMINDER_TRIGGER_SECRET` | strong random; shared with the pg_cron GUC (§8) | `openssl rand -hex 32` |
| `DEV_AUTH_EMAIL` | **unset** | — |
| `DEV_AUTH_ROLE` | **unset** | — |

---

## 8. Phase 6 — Scheduled reminder (pg_cron GUCs)

Migration `0008_sms.sql` registers the `sms-reminders` job (every minute), but its
body reads two per-database GUCs that are unset until you set them — while unset it
exits with a NOTICE (no 401 noise). After the app is reachable, run against Cloud:
```sql
alter database postgres set app.reminder_url    = 'https://<hostname>/api/reminders';
alter database postgres set app.reminder_secret = '<REMINDER_TRIGGER_SECRET>';
```
- `<hostname>` = the production hostname (§0).
- `<REMINDER_TRIGGER_SECRET>` must equal the env var (§7).
- The reachability of `/api/reminders` through Access is the §5.4 decision.

The handler is idempotent (`orders.reminded_at`), so a duplicate cron fire is harmless.

---

## 9. Open decisions

These block a clean first cutover — resolve, then update the `TBD`s above.

1. **VPS provider + process manager** — host (e.g. Hetzner EU) and systemd vs pm2
   (recommended: systemd, §3.3).
2. **Production hostname** — drives the tunnel ingress (§5.1) and the reminder URL (§8).
3. **`/api/reminders` past Access** — service token (5.4a) vs path bypass (5.4b).
4. **Access session duration** — the shared-tablet long session value (§5.2).

> Resolved: prod seeding now lives in `supabase/seed.prod.sql` (§2.4) — edit the
> manager-email placeholder and run it once.

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
- [ ] Access **bypass** policy for `POST /api/sms/webhook` (§5.3)
- [ ] `/api/reminders` reachability decided + configured (§5.4)
- [ ] pg_cron GUCs `app.reminder_url` / `app.reminder_secret` set (§8)
- [ ] Smoke test: load calendar, create an order, verify Realtime update, check audit log
- [ ] Backups confirmed; provider DPA documented (§2.6, §7)
```
