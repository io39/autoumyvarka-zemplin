# Autoumyváreň Zemplín — Rezervačný systém

Internal web application for a single car-wash operation. The manager takes reservations during phone calls, workers get a clear live view of what to wash and when, and the system keeps a searchable per-client history of cars and performed services. It replaces paper/phone bookings with a structured workflow and adds automated SMS to clients. The central entity is the **order (objednávka)** — a reservation for one car, in one of two wash boxes, at a time slot, moving through the states *vytvorená → hotová → zaplatená* (with *nedostavil sa* as an alternate terminal state).

Full requirements in `docs/prd.md` — **the PRD is written in Slovak**, as is every user-facing string in the app. Project docs (architecture, specs) are written in English; only UI copy, SMS templates, and domain labels are Slovak. Architecture in `docs/architecture.md`. Per-feature specs in `docs/specs/`.

## Stack

- **Framework**: Next.js 16 App Router, TypeScript strict
- **Backend approach**: Next.js Server Actions preferred. Route Handlers only for SMS provider webhooks (delivery callbacks) and the scheduled 30-minute reminder trigger.
- **Database**: Supabase Postgres, Cloud EU region (Frankfurt / eu-central-1). Supabase Realtime drives live calendar updates.
- **UI**: shadcn/ui + Tailwind CSS. Mobile-first — the reservation form and calendar are designed for phone screens (≥360px) first.
- **Auth**: Cloudflare Access (Zero Trust) at the edge — see Auth model below.
- **Hosting**: Self-hosted EU VPS, exposed via Cloudflare Tunnel. Data lives in Supabase Cloud EU. Automatic backups required (GDPR, PRD §14).
- **Package manager**: pnpm
- **Validation**: zod at every Server Action boundary and at the SMS webhook boundary.

## Auth model

This is an internal tool, so authentication lives at the **edge, not in the app**. Cloudflare Access (Zero Trust) gates the entire site; a Cloudflare Tunnel connects the self-hosted VPS to Cloudflare without exposing the VPS publicly. The app trusts the Cloudflare Access identity (forwarded JWT / `Cf-Access-Authenticated-User-Email` header) and does not implement its own login screen.

The app's job is **authorization, not authentication**: it maps the edge-authenticated identity to one of two roles from PRD §3 — **manažér** (administrator) or **prevádzka** (worker, fewer privileges). Role determines which actions are allowed (e.g. only the manager may move/delete an order, mark *nedostavil sa*, edit notes, or manage the service catalog and staff). The shared-tablet "long-lived session" requirement (PRD §3) is satisfied by Cloudflare Access session duration configured for that device.

Supabase Row-Level Security is **defense-in-depth**, not the primary gate. The primary gate is Cloudflare Access at the edge plus role checks in Server Actions; RLS is a backstop against direct database access.

## Commands

```bash
pnpm dev                # local dev server
pnpm build              # production build
pnpm typecheck          # type check
pnpm lint               # lint
pnpm test               # tests
supabase start          # local DB stack
supabase db push        # apply migrations
```

## Project conventions

- **Server Actions preferred over Route Handlers.** Route Handlers only for the SMS provider webhook (delivery status) and the scheduled reminder trigger.
- **All user-facing strings are Slovak.** No i18n framework in Phase 1 (PRD §14, Lokalizácia) — but don't hardcode strings in ways that would make a later extraction impossible.
- **Secrets never in the repo.** `.env.local` is gitignored. Deployment uses the VPS host's environment store; Supabase keys and the SMS provider credentials live there, never in the repo.
- **Migrations are checked in.** Never modify the schema through the Supabase dashboard against the live project — write a migration, check it in, `supabase db push`.
- **Soft-delete, never hard-delete domain history.** Services and orders that carry client history are deactivated, not deleted (PRD §9.1), to preserve history integrity (PRD §10).
- **Phone number is the client key.** Clients are identified and searched by phone number (PRD §4). Cars and history hang off the client.
- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`, etc.).
- **All Server Action inputs validated with zod**, including the SMS webhook payload.
- **Every state change writes to the audit log** (PRD §11): order creation, status transitions, deletions, note edits, worker reassignment, and service add/remove/paid changes.

## File organization

```
app/                          # Next.js App Router routes
components/                    # shared UI (shadcn/ui based)
lib/                           # domain logic, Supabase clients, validation schemas
supabase/migrations/          # checked-in SQL migrations
docs/
  prd.md                      # product requirements (Slovak)
  architecture.md
  data-model.md
  specs/                      # one file per feature
    README.md                 # index in dependency order
tests/
  unit/                       # domain logic, conflict detection, duration calc
  e2e/                        # reservation flow, role permissions
.claude/
  agents/                     # subagents
  skills/                     # progressive-disclosure skills
  hooks/                      # deterministic guards
```

## Git workflow

**Current phase: planning.**

Planning: push directly to `main`. No development code yet. Branch protection not enabled.

Development (solo, trunk-based): continue working on `main` with short-lived local commits. Keep `main` releasable; use a feature branch only when a change is large enough to risk leaving `main` broken. No separate staging branch in Phase 1.

Commit messages follow conventional commits.

## Working with Claude Code

- **Spec-driven.** A genuinely new feature area gets a spec in `docs/specs/<NN>-<name>.md` (or `docs/ui-specs/`) before implementation, following Requirements → Design → Tasks → Acceptance Criteria with checkable shell commands.
- **Specs are the single source of truth — update, don't proliferate.** When a change touches an existing feature, **update and merge** the new behavior into the existing spec(s) rather than creating a new versioned spec file or a duplicate section. Revise/remove outdated requirements that conflict, keep each feature's definition in **one** authoritative place, preserve numbering/structure/formatting, and if a change spans several specs update all of them so they stay consistent. Specs must describe the **current** intended behavior, not the historical evolution. Only create a brand-new spec file for a feature area that genuinely has no existing home. Before finishing, scan the affected specs for contradictions, duplicates, and obsolete acceptance criteria.
- **Subagents** in `.claude/agents/`:
  - `spec-writer` — drafts new feature specs in the format established by the first spec
  - `code-reviewer` — reviews code against this file and the relevant spec after meaningful changes
- **Skills** in `.claude/skills/` load automatically when working in the relevant area. They encode project-specific patterns that aren't obvious from the framework defaults (e.g. the box-conflict / duration-calculation rules, the Cloudflare-Access role-mapping pattern, migration conventions).
- **Hooks** in `.claude/hooks/settings.json` enforce non-negotiable rules (typecheck on edit, block destructive DB operations).
- **When unsure, ask.** If a decision isn't clear from the PRD, this file, or the relevant spec, surface the question rather than guess. Several PRD items are explicitly open (§13: shared ŠPZ ownership, Phase-1 pricing, duration mechanism, final SMS wording).

