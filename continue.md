# Continue — handoff for the next agent

**Project:** Autoumyváreň Zemplín — internal reservation system for a single car wash.
**Phase:** Planning is **complete**. Next phase is **implementation**, spec-driven.
**Last updated:** 2026-05-27.

Read these first, in order: `CLAUDE.md` (conventions), `docs/prd.md` (Slovak
requirements), `docs/architecture.md`, `docs/data-model.md`, `docs/specs/README.md`.

---

## Where things stand

Planning artifacts are all written and committed locally on `main`:

- `docs/architecture.md` — stack, edge-auth flow, deployment, env map, version policy.
- `docs/data-model.md` — full schema (14 tables), RLS posture, soft-delete map.
- `docs/services.md` — the client's price list (source for the catalog seed).
- `docs/specs/01..10` — feature specs, dependency-ordered, all ✅ in `docs/specs/README.md`.
- `.claude/` — `spec-writer` + `code-reviewer` subagents, hooks, and 3 skills
  (`supabase-migrations`, `edge-auth-authz`, `order-duration-conflict`).

**No application code exists yet.** Nothing in `app/`, `lib/`, `supabase/` has been
scaffolded. The repo is docs + `.claude/` only.

### Git state — important
- Commits are **local and unpushed.** The hook `.claude/hooks/block-dangerous-bash.sh`
  blocks `git push … main` and force-push **from inside Claude Code sessions** (the
  user pushes from their own terminal). Don't try to push to `main`; ask the user to.
- `CLAUDE.md` and `docs/Autoumyvaren-Projektove-Poziadavky-v2.docx` are **untracked**
  (pre-existing). Ask before committing `CLAUDE.md`.

---

## Next steps (implementation)

Implement in spec order; each spec's "Tasks" + "Acceptance criteria" are the checklist.

1. **Scaffold the project** (part of spec 01, task 1): Next 16 App Router + TS strict,
   Tailwind 4, shadcn/ui, pnpm, `.nvmrc` (Node 22), `.env.example`, scripts
   (`dev/build/typecheck/lint/test`), local Supabase (`supabase start`).
2. **Spec 01 — foundation** (`docs/specs/01-foundation-auth-and-staff.md`): the walking
   skeleton — edge-identity→role helpers, dev-auth shim (with production hard-guard),
   migration `0001` (enums + `staff` + `audit_log` + deny-by-default RLS), seed a manager
   row, Realtime JWT mint helper, staff CRUD. This proves the whole vertical path; deploy
   the thin end-to-end skeleton once it works (architecture §8 step 2).
3. **Then 02 → 10 in order.** Dependencies are in `docs/specs/README.md`. Rough order:
   02 clients & cars → 03 catalog → 04 hours/overrides → 05 reservations & calendar (the
   big one) → 06 order lifecycle → 07 SMS → 08 client history → 09 audit view → 10 unpaid
   alerts.

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
