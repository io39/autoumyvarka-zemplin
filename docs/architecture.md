# Architecture — Autoumyváreň Zemplín

Internal reservation system for a single car wash. This document locks in the
technical architecture, deployment topology, and version-pinning policy. It is
the source of truth for *structure*; the lockfile is the source of truth for
*exact versions*. Written in English (per `CLAUDE.md`); only user-facing copy is
Slovak.

---

## 1. Stack

| Layer | Choice | Major version | Rationale |
| --- | --- | --- | --- |
| Framework | Next.js (App Router) | **16** | Settled (`CLAUDE.md`). Server Components + Server Actions are the primary backend mechanism. |
| Language | TypeScript (strict) | **5.x** | `strict: true`. |
| Runtime | Node.js | **22 LTS** | Safe LTS for Next 16; pinned in `.nvmrc`. |
| UI runtime | React | **19** | Ships with Next 16. |
| Styling | Tailwind CSS | **4.x** | Mobile-first (≥360px), per PRD §14. |
| Components | shadcn/ui | (tracks React 19 / Tailwind 4) | Copy-in components, not a versioned runtime dep; pinned implicitly by the snapshot committed into `components/`. |
| Database | Supabase Postgres | hosted (Cloud EU, eu-central-1) | Settled. GDPR-resident (PRD §14). |
| DB client | `@supabase/supabase-js` | **2.x** | Server + browser clients. |
| Realtime | Supabase Realtime | (part of supabase-js 2.x) | Drives live calendar updates (PRD §5). |
| Validation | zod | **3.x** | Every Server Action boundary + the SMS webhook boundary. |
| Calendar/scheduling UI | **TBD** | — | Two-box day/week view (PRD §5). Fast-moving; **pin the minor on selection.** |
| SMS provider SDK | **TBD** (Slovak provider) | — | Cheapest viable provider (PRD §8.2). Fast-moving; **pin the minor on selection.** |
| Package manager | pnpm | latest | Settled. |

**Backend approach.** Next.js **Server Actions** are the default for all mutations
and reads invoked from the UI. **Route Handlers** exist for exactly two boundaries:

1. **SMS provider webhook** — inbound delivery-status callbacks (PRD §8).
2. **Scheduled reminder trigger** — invoked by the scheduler (see §6) to send the
   30-minute reminders.

Both are validated with zod at the boundary.

---

## 2. Authorization model (edge auth, in-app authz)

Authentication is at the **edge**, not in the app (`CLAUDE.md`, PRD §3 superseded).
Cloudflare Access (Zero Trust) gates the entire site; a Cloudflare Tunnel connects
the VPS without exposing it publicly. The app trusts the forwarded identity and
performs **authorization only**: it maps the identity to one of two roles —
**manažér** (admin) or **prevádzka** (worker) — and enforces per-action rules
(PRD §3). Supabase RLS is defense-in-depth, not the primary gate.

### 2.1 Auth flow

```
                    ┌─────────────────────────────────────────────┐
   Browser/tablet   │              Cloudflare edge                 │
   ───────────────► │  Cloudflare Access (Zero Trust)              │
                    │   • authenticates the user (IdP / OTP)       │
                    │   • issues session cookie (long-lived on the │
                    │     shared tablet — PRD §3)                  │
                    │   • injects Cf-Access-Authenticated-User-    │
                    │     Email + signed Cf-Access-Jwt-Assertion   │
                    └───────────────────────┬─────────────────────┘
                                             │ Cloudflare Tunnel (cloudflared)
                                             ▼
                    ┌─────────────────────────────────────────────┐
   Self-hosted VPS  │              Next.js 16 app                  │
                    │  1. Read identity from request header        │
                    │  2. Map email → role (manažér | prevádzka)   │
                    │     via the staff table                      │
                    │  3. Server Action runs role check BEFORE     │
                    │     any mutation; rejects unauthorized       │
                    │  4. Audit-log every state change (PRD §11)   │
                    └───────────────────────┬─────────────────────┘
                                             │ supabase-js (service/anon as appropriate)
                                             ▼
                    ┌─────────────────────────────────────────────┐
   Supabase Cloud   │         Postgres (RLS = backstop)            │
   (EU, Frankfurt)  │  Realtime → pushes calendar updates back     │
                    └─────────────────────────────────────────────┘
```

The role check is centralized in a single helper in `lib/` (see the auth skill /
first spec). No Server Action mutates without first resolving the caller's role.

### 2.2 Local-dev auth bypass

Cloudflare Access does **not** sit in front of `pnpm dev`, so the identity header
is absent locally. A dev-only identity shim reads `DEV_AUTH_EMAIL` (and an optional
`DEV_AUTH_ROLE`) from `.env.local` and injects the same identity the edge would.

**Hard guard:** the shim must refuse to activate when `NODE_ENV === 'production'`.
In production the identity comes only from the Cloudflare-signed header; a missing
header in production is an error (deny), never a fallback to a dev identity. This
is the first thing that bites a new contributor — it is enforced in code, not by
convention.

---

## 3. Deployment topology

```
  Internet ─► Cloudflare (Access + WAF) ─► Cloudflare Tunnel ─► VPS (EU)
                                                                  │
                                                                  ├─ Next.js 16 (node 22, pnpm)
                                                                  └─ cloudflared daemon
                                                                  
  VPS ──────────────────────────────► Supabase Cloud (EU, eu-central-1)
        supabase-js over HTTPS/WSS       • Postgres
                                         • Realtime
                                         • pg_cron (reminder scheduler — §6)
                                         • automatic backups (GDPR — §7)
```

- The VPS is **never** exposed publicly; the only ingress is via the Cloudflare
  Tunnel. There is no open inbound port for the app.
- The Next.js app runs as a long-lived process on the VPS (process manager TBD at
  deploy time — systemd or pm2; not architecturally significant).
- Supabase Cloud is reached outbound over HTTPS/WSS from the VPS.

### 3.1 Environments

Two environments in Phase 1 (no staging — decided in planning context):

| Environment | App | Database |
| --- | --- | --- |
| **local dev** | `pnpm dev` on the developer machine | `supabase start` (local Docker stack) |
| **production** | VPS behind Cloudflare Tunnel | Supabase Cloud EU |

### 3.2 Environment variables

Secrets are **never** in the repo (`CLAUDE.md`). `.env.local` is gitignored;
production values live in the VPS host's environment store (not in the repo, not
in the image).

| Variable | local (`.env.local`) | production (VPS env store) | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | local stack URL | Supabase Cloud URL | Browser + server client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local anon key | Cloud anon key | Browser client (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | local service key | Cloud service key | Server-side privileged ops |
| `SUPABASE_JWT_SECRET` | local JWT secret | Cloud JWT secret | Mint short-lived browser tokens for Realtime (see data-model §3.1) |
| `SMS_PROVIDER_API_KEY` | sandbox/empty | provider key | SMS send (PRD §8) |
| `SMS_WEBHOOK_SECRET` | dev secret | shared secret w/ provider | Verify inbound webhook |
| `REMINDER_TRIGGER_SECRET` | dev secret | shared secret w/ pg_cron | Authenticate the scheduled trigger (§6) |
| `DEV_AUTH_EMAIL` | dev identity | **unset** | Local auth shim (§2.2) — inert in prod |
| `DEV_AUTH_ROLE` | `manazer` / `prevadzka` | **unset** | Local role override — inert in prod |

A `.env.example` (committed, no secret values) documents the full set.

---

## 4. File storage

**None in Phase 1.** No entity in the PRD carries an uploaded file (no photos,
documents, or attachments). No Supabase Storage bucket is provisioned. If Phase 2
introduces, e.g., damage photos, a bucket + retention policy gets added then — not
pre-built now.

---

## 5. Realtime (live calendar)

Supabase Realtime broadcasts Postgres changes on the `orders` table (and related
rows affecting the calendar) to every open calendar client, satisfying PRD §5's
"updates without manual refresh" requirement. Clients subscribe scoped to the
visible day/box range. RLS applies to Realtime, so the backstop holds here too.

---

## 6. Scheduled 30-minute reminder

The reminder must fire ~30 min before each order's start time (PRD §8). Since the
deployment is self-hosted (no Vercel Cron), the trigger is owned by **Supabase
`pg_cron`**:

- A `pg_cron` job runs every minute and issues an HTTP request (via `pg_net`) to
  the reminder **Route Handler** on the app, passing `REMINDER_TRIGGER_SECRET`.
  The job reads its target URL and that secret from **Supabase Vault** (secrets
  `reminder_url` / `reminder_secret`, migration `0019`) — not from per-database GUCs,
  which cannot be set on Supabase Cloud without superuser. See `deployment.md` §8.
- The Route Handler selects orders whose start is ~30 min out, that are still in
  state *vytvorená*, and not yet reminded, then dispatches SMS and records the
  attempt (PRD §8: failures are logged and visible on the order).

**Rationale:** `pg_cron` keeps scheduling EU-resident and next to the data, needs
no extra VPS daemon, and survives app restarts. Alternatives (systemd timer on the
VPS, a long-running Node worker) were rejected as more moving parts for no benefit.
The Route Handler is idempotent (a "reminded" marker prevents double-send), so a
duplicate cron fire is harmless.

---

## 7. Compliance (GDPR)

Client phone numbers and names are personal data (PRD §14).

- **In transit:** HTTPS everywhere (Cloudflare edge → tunnel → app; app → Supabase).
- **At rest:** Supabase-managed encryption; EU region (eu-central-1) only.
- **Backups:** Supabase automatic backups (PRD §14). Backup cadence/retention
  confirmed against the chosen Supabase plan before launch.
- **Data residency:** all data in the EU. No third-country transfer except the SMS
  provider, which receives only the phone number + message at send time (document
  the provider's DPA before launch).
- **Audit log:** retained ≥3 months (PRD §11.2); see `data-model.md`.
- **Soft-delete:** domain history (services, orders) is deactivated, never
  hard-deleted (`CLAUDE.md`, PRD §9.1/§10).

---

## 8. Local-first walking-skeleton workflow

Principle (planning context): build locally first, deploy a thin end-to-end
skeleton as soon as one exists, then iterate — never stand up infra with nothing
to put on it, never build for months without deploying.

1. **Local stack.** `supabase start` + `pnpm dev`. First migration + the auth shim
   (§2.2) land here. All early feature work happens fully locally.
2. **Walking skeleton.** As soon as the first vertical slice exists (first spec:
   identity → role → one CRUD path with an audit-log write), provision the Supabase
   Cloud EU project and stand up the VPS + Cloudflare Tunnel + Access, and deploy
   that thin slice end-to-end. This proves edge-auth → app → DB → Realtime before
   most features exist.
3. **Iterate against prod-shaped infra.** Subsequent features developed locally,
   migrations checked in (`supabase db push`), deployed in short trunk-based
   increments (`CLAUDE.md` git workflow). Keep `main` releasable.
4. **Scheduler + webhook** stood up when the SMS feature's spec is implemented —
   not before (nothing to trigger until then).

---

## 9. Version pinning policy

- **Lockfile is the source of truth.** `pnpm-lock.yaml` is committed and pins every
  exact version transitively. CI installs with `--frozen-lockfile`.
- **`package.json` uses caret ranges** (`^`) for normal deps, allowing patch/minor
  updates within a major on deliberate `pnpm update`.
- **This document records majors only**, with rationale (table in §1). It does not
  track patch/minor — the lockfile does.
- **Runtime is pinned exactly** via `.nvmrc` (Node 22 LTS).
- **Fast-moving libraries get their minor pinned on selection:** the calendar/
  scheduling component and the SMS provider SDK are pinned to an exact minor (no
  caret) the moment they're chosen, because their breaking-change cadence is high
  and the cost of a surprise bump is a broken calendar or broken SMS. Record the
  chosen version + the pin decision in §1 when selected.
