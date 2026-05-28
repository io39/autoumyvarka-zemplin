# Continue — handoff for the next agent

**Project:** Autoumyváreň Zemplín — internal reservation system for a single car wash.
**Phase:** Implementation, spec-driven. **Specs 01–03 are done; spec 04 is next.**
**Last updated:** 2026-05-28.

Read these first, in order: `CLAUDE.md` (conventions), `docs/prd.md` (Slovak
requirements), `docs/architecture.md`, `docs/data-model.md`, `docs/specs/README.md`.

---

## First-run setup (do this before any code work)

The local stack must be up and `.env.local` must exist (it's gitignored, so a fresh
checkout has none). From the repo root:

```bash
corepack pnpm install                 # pnpm runs via corepack (no global install)
# start Docker Desktop first (supabase needs it), then:
pnpm supabase start                   # boots the local Postgres/Realtime stack
pnpm supabase status -o env           # copy ANON_KEY/SERVICE_ROLE_KEY/JWT_SECRET into .env.local
pnpm supabase db reset                # applies all migrations + seed (manager + worker)
pnpm typecheck && pnpm test           # sanity: should all pass
```

`.env.local` keys (see `.env.example` for the full set): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
plus the dev shim `DEV_AUTH_EMAIL`/`DEV_AUTH_ROLE`. After any new migration, rerun
`pnpm supabase db reset` and `pnpm supabase gen types typescript --local --schema public
> lib/supabase/database.types.ts`.

---

## Where things stand

Planning artifacts are all written and committed locally on `main`:

- `docs/architecture.md` — stack, edge-auth flow, deployment, env map, version policy.
- `docs/data-model.md` — full schema (14 tables), RLS posture, soft-delete map.
- `docs/services.md` — the client's price list (source for the catalog seed).
- `docs/specs/01..10` — feature specs, dependency-ordered, all ✅ in `docs/specs/README.md`.
- `.claude/` — `spec-writer` + `code-reviewer` subagents, hooks, and 3 skills
  (`supabase-migrations`, `edge-auth-authz`, `order-duration-conflict`).

### Implementation status
- **Spec 01 — DONE** (commit `feat: scaffold app and implement spec 01`). The app is
  scaffolded: Next 16 (App Router, TS strict), React 19, Tailwind 4, shadcn/ui, pnpm,
  Vitest + Playwright. Migration `0001_foundation.sql` (all enums + `staff` +
  `audit_log` + deny-by-default RLS), `seed.sql` (manager + a worker), generated
  `lib/supabase/database.types.ts`. Auth lib (`lib/auth/*`), service-role client,
  audit writer, Realtime JWT mint, staff Server Actions + `/staff` UI + `/` home +
  Slovak 401/403 views. 21 unit + 5 e2e tests pass.
- **Spec 02 — DONE** (commit `feat: implement spec 02 (clients & cars)`). Migration
  `0002_clients_cars.sql` (pg_trgm + unaccent; `clients`/`cars`/`client_cars` + trigram
  GIN indexes + RLS; `search_clients(q,lim)` RPC, execute revoked from anon/authenticated).
  Normalizers `lib/clients/phone.ts` + `lib/cars/spz.ts`. Actions in
  `lib/actions/clients.ts` + `lib/actions/cars.ts` (shared-ŠPZ link detection,
  manager-only edits, phone_change audit). UI `/clients` (fuzzy search) + `/clients/[id]`
  (detail, add-car/link-confirm, history placeholder for spec 08). 26 unit + 11 e2e pass.
- **Spec 03 — DONE** (commit `feat: implement spec 03 (service catalog)`). Migration
  `0003_service_catalog.sql` (`services` + `service_prices`, `unique nulls not
  distinct (service_id, pricing_category)`, deny-by-default RLS). `supabase/seed.sql`
  extended with 24 services / 47 prices translated from `docs/services.md` (cents,
  `price_from` for "od" rows, `is_per_unit` for `/ks` add-ons, NULL durations for
  time-less items). Pure resolver `lib/services/price-lookup.ts` (category → NULL
  fallback → "not available"); Slovak formatters `lib/services/format.ts`. Actions
  in `lib/actions/services.ts` (`listServices`, `getServicePrice`, `createService`,
  `updateService`, `upsertServicePrice`, `deleteServicePrice`, `setServiceActive`).
  UI `/services` (list + add) and `/services/[id]` (per-category grid edit) —
  manager-only, 403 for workers. 44 unit + 19 e2e tests pass.

### Local environment notes (real, learned this session)
- **pnpm** runs via corepack (`pnpm 11.3.0`); the supabase CLI is a devDependency
  (`pnpm supabase …`). Node 22 (`.nvmrc`).
- `.env.local` is generated from `pnpm supabase status -o env` (gitignored).
- **E2e runs against a production build** (`pnpm build && pnpm start`), not `pnpm dev`:
  Turbopack's HMR websocket fails under the sandbox and blocks hydration, so dialogs/
  forms never become interactive under `pnpm dev` *in the agent sandbox*. Local `pnpm
  dev` in a real terminal is fine. See `tests/README.md`.
- Targeted tests: `pnpm test:unit <path>` / `pnpm test:e2e <path>` (the chained `pnpm
  test <arg>` would send the arg to Playwright only).

### Git state — important
- Commits are **local and unpushed.** The hook `.claude/hooks/block-dangerous-bash.sh`
  blocks `git push … main` and force-push **from inside Claude Code sessions** (the
  user pushes from their own terminal). Don't try to push to `main`; ask the user to.
- `docs/Autoumyvaren-Projektove-Poziadavky-v2.docx` is untracked (pre-existing).

---

## Next steps (implementation)

Implement in spec order; each spec's "Tasks" + "Acceptance criteria" are the checklist.

1. **Specs 01, 02 & 03 — DONE.**
2. **Spec 04 — settings: opening hours & day overrides** (next):
   `docs/specs/04-settings-opening-hours-holidays.md`. Reuse the established patterns:
   checked-in migration + `supabase db reset` + `pnpm supabase gen types` → alias in
   `lib/supabase/types.ts`; `lib/actions/result.ts` (`ActionResult`/`toActionError`);
   `getCurrentStaff` + `requireManager` before mutations; `writeAudit` with before/after
   `details`; zod at every boundary; e2e against the production build
   (see `tests/README.md`).
3. **Then 05 → 10 in order.** Dependencies are in `docs/specs/README.md`. Rough order:
   05 reservations & calendar (the big one) → 06 order lifecycle → 07 SMS → 08 client
   history → 09 audit view → 10 unpaid alerts.

**Walking-skeleton deploy** (architecture §8 step 2) — provision Supabase Cloud EU +
VPS + Cloudflare Tunnel/Access and deploy the thin slice — is still pending; do it when
convenient now that spec 01 proves the vertical path.

Use the **`spec-writer`** subagent only if a *new* spec is needed; use **`code-reviewer`**
after meaningful changes. The skills in `.claude/skills/` auto-load for migrations, auth,
and order-domain work — follow them.

---

## Non-negotiable conventions (from CLAUDE.md — enforce while coding)

- **Server Actions** for everything except two Route Handlers: the SMS webhook and the
  reminder trigger (spec 07).
- **zod** at every Server Action boundary and the SMS webhook.
- **Every state change writes `audit_log`** with the actor identity.
- **Authz**: every mutating action calls the role helper (`requireManager()` etc.)
  before mutating. Auth is at the Cloudflare edge; the app does authorization only.
- **RLS deny-by-default** on every table; `service_role` server-side only; browser
  Realtime uses a **server-minted JWT** (Supabase is NOT behind Cloudflare — see
  data-model §3.1). Never add an anon read policy exposing client PII.
- **Migrations are checked-in SQL**, never dashboard edits. Never
  `supabase db reset --linked` (hook-blocked).
- **Soft-delete** domain history; never hard-delete orders/services/clients.
- **All user-facing strings Slovak.** Phone = client key. ŠPZ shared across clients.

## Key decisions already made (don't re-litigate)

- 6 `pricing_category` values: `os, suv, van, dod, motorka, stavba`. Durations/prices are
  a full per-(service × category) table (no multiplier), seeded from `docs/services.md`.
- `day_overrides` = per-date closed OR custom hours; wins over weekly `opening_hours`.
- 15-minute slot grid; calendar blocks show ŠPZ + model + finish time.
- Box conflict prevented by a **DB exclusion constraint** (btree_gist), excluding
  deleted + `nedostavil_sa`.
- Status: `vytvorena→hotova` (any role), `hotova→zaplatena` (mgr), `vytvorena→
  nedostavil_sa` (mgr), and the **exception** `nedostavil_sa→vytvorena` (mgr, late
  arrival, re-checks conflict/hours).
- **Multiple workers** per order via `order_staff` M:N (no `assigned_staff_id`).
- Unified fuzzy search (phone/name/ŠPZ) via Postgres **pg_trgm** trigram indexes.
- Reminder SMS via Supabase **pg_cron** → Route Handler, idempotent on `orders.reminded_at`.
- Browsing past day/week history = calendar **date navigation** (spec 05), not a
  separate archive feature.

## Open questions for the client (flagged in specs; not blocking implementation)

1. Final SMS wording + signature (PRD §13#4) — placeholders seeded for now.
2. Split-shift / lunch-break hours — current model is one open–close interval per day
   (spec 04 §2.2). Promote `opening_hours`/`day_overrides` to multiple rows if needed.
3. "Unpaid" definition for alerts (spec 10 §1.2) — confirm the default.
4. Whether `prevadzka` (workers) may see the unpaid-alerts view (spec 10 §1.4).
5. Whether cancelled (soft-deleted) orders should appear in client history (spec 08 §2.2).
6. Real opening-hours defaults and the exact "/kabína" service modeling (spec 03/04).

## Gotchas

- Don't build a login page — auth is edge (Cloudflare Access). Local dev uses the
  env-gated dev-auth shim; it must be inert when `NODE_ENV=production`.
- The SMS delivery webhook is the one route that bypasses Cloudflare Access; it verifies
  `SMS_WEBHOOK_SECRET` in-handler (spec 07 §2.8).
- Calendar/scheduling UI component and the Slovak SMS provider SDK are **TBD** — pick and
  pin the minor when you reach specs 05 / 07 (architecture §1, §9).
