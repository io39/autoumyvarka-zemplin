# Spec 01 — Foundation: edge auth, role mapping, and staff management

> **Status:** draft · **PRD refs:** §3 (roles & permissions), §11 (audit log),
> §14 (GDPR, hosting) · **Depends on:** nothing (this is the root spec) ·
> **Architecture refs:** §2 (authz), §3.2 (env), §6 (scheduler n/a here), §8
> (walking skeleton) · **Data-model refs:** §2.1 `staff`, §2.11 `audit_log`, §3 (RLS)

This is the **walking-skeleton** slice (architecture §8 step 2) and the **template
spec** all later specs follow. It proves the full vertical path — Cloudflare Access
identity → role mapping → role-checked Server Action → DB write → audit log →
deny-by-default RLS → server-minted Realtime token — using staff management as the
first exercised feature.

---

## 1. Requirements

### 1.1 What this feature does

1. Resolve the **edge-authenticated identity** (`Cf-Access-Authenticated-User-Email`)
   on every request and map it to a `staff` row → a role (`manazer` | `prevadzka`).
2. Provide a single **authorization helper** in `lib/` that every Server Action
   uses to (a) get the current actor and (b) assert a required role before mutating.
3. Provide a **dev-auth shim** so the app is usable under `pnpm dev` where Cloudflare
   Access is absent — with a hard guard that it is inert in production.
4. Establish the **deny-by-default RLS baseline** on all tables and the
   **Realtime JWT minting helper** (data-model §3.1).
5. **Staff management** (manager-only): list, create, edit, and activate/deactivate
   staff. This is the first feature that exercises the auth + audit + RLS path.
6. Write an **`audit_log`** entry for every staff mutation.

### 1.2 User stories (from PRD §3)

- As the **manager**, I can add a worker, set their role, and deactivate someone who
  has left — so the system knows who may do what.
- As a **worker**, the app already knows who I am (no login screen) and lets me do
  worker-allowed actions but blocks manager-only ones.
- As **either role**, my session persists on the shared tablet (handled by
  Cloudflare Access session duration — not app code).

### 1.3 Non-goals

- No in-app login/password UI (auth is at the edge — `CLAUDE.md`, supersedes PRD §3
  wording).
- No order/client/calendar features (later specs).
- No SMS, scheduler, or webhook (later specs); this slice only needs them to *not
  exist yet*.
- No self-service: staff are managed only by the manager.

---

## 2. Design

### 2.1 Identity & role resolution

- `lib/auth/identity.ts` — `getIdentity()`:
  - **Production:** read `Cf-Access-Authenticated-User-Email` from request headers.
    Missing header ⇒ throw (deny). Never falls back.
  - **Dev shim:** if `NODE_ENV !== 'production'` **and** `DEV_AUTH_EMAIL` is set, use
    it (+ optional `DEV_AUTH_ROLE`). The shim is **hard-guarded**: a check that
    refuses to activate when `NODE_ENV === 'production'`, even if the env var leaks.
- `lib/auth/session.ts` — `getCurrentStaff()`: looks up the email in `staff`
  (`active = true`), returns `{ id, email, role, display_name }` or throws if the
  identity maps to no active staff row.
- `lib/auth/require.ts` — `requireRole('manazer')` / `requireManager()`: asserts the
  current actor's role, throws a typed `ForbiddenError` otherwise. **Every mutating
  Server Action calls this first.**

### 2.2 Routes & UI

| Route | Access | Purpose |
| --- | --- | --- |
| `/staff` | manager only | list staff (active + inactive), add/edit/deactivate |
| `/` | any role | placeholder home showing the resolved identity + role (skeleton proof) |

- `prevadzka` navigating to `/staff` gets a 403 view (Slovak: "Nemáte oprávnenie").
- Components: shadcn/ui `Table`, `Dialog` (add/edit form), `Button`, `Badge` for
  role/active. Mobile-first (≥360px).

### 2.3 Server Actions (`lib/actions/staff.ts`)

All validate input with zod and call `requireManager()` first; all write `audit_log`.

| Action | Input (zod) | Authz | Audit action |
| --- | --- | --- | --- |
| `createStaff` | `{ email, display_name, role }` | manager | `staff.create` |
| `updateStaff` | `{ id, display_name, role }` | manager | `staff.update` |
| `setStaffActive` | `{ id, active }` | manager | `staff.activate` / `staff.deactivate` |

- `email` unique; duplicate ⇒ friendly Slovak error, no crash.
- A manager **cannot deactivate themselves** (guard against lockout).
- Reads (`listStaff`) run server-side via `service_role`; no role assertion needed
  beyond page-level manager gate, but the page itself asserts manager.

### 2.4 Data & migrations

- Migration `0001_foundation.sql`:
  - enums from data-model §1 (all of them, created once here).
  - tables `staff` and `audit_log` (data-model §2.1, §2.11) with their indexes.
  - **enable RLS** on both with **no `anon` policies** (deny-by-default). `service_role`
    bypasses RLS.
- Seed `supabase/seed.sql`: one `manazer` row for the developer's own email so the
  local stack is usable immediately.

### 2.5 Realtime token helper

- `lib/realtime/token.ts` — `mintRealtimeToken(identity)`: signs a short-lived JWT
  with `SUPABASE_JWT_SECRET` carrying `{ role: 'authenticated', email }`. Not yet
  consumed by a calendar (no calendar in this spec) but built and unit-tested here so
  the skeleton is complete and the pattern is locked for spec(s) that add Realtime.

### 2.6 Error handling & loading states

- `ForbiddenError` → 403 view; `UnauthenticatedError` (no identity in prod) → 401
  view. Both Slovak copy.
- Server Action errors return a typed result `{ ok: false, message }` rendered inline
  in the dialog; never an unhandled throw to the client.
- `/staff` uses a loading skeleton (shadcn `Skeleton`) during fetch.

---

## 3. Tasks

Ordered; complexity S/M/L; dependencies in parentheses.

1. **(S)** Project scaffold: Next 16 app, TS strict, Tailwind 4, shadcn/ui init,
   `.nvmrc` (Node 22), `.env.example`, `pnpm` scripts (`dev/build/typecheck/lint/test`).
2. **(S)** `supabase/` local stack config; verify `supabase start` runs.
3. **(M)** Migration `0001_foundation.sql`: enums + `staff` + `audit_log` + indexes +
   RLS enable/deny-by-default. (dep: 2)
4. **(S)** `supabase/seed.sql` with one manager row. (dep: 3)
5. **(M)** `lib/auth/identity.ts` + dev-auth shim with production hard-guard. (dep: 1)
6. **(M)** `lib/auth/session.ts` (`getCurrentStaff`) + `lib/auth/require.ts`
   (`requireManager`, typed errors). (dep: 3, 5)
7. **(M)** `lib/actions/staff.ts`: `createStaff` / `updateStaff` / `setStaffActive`
   with zod + `requireManager` + audit writes + self-deactivation guard. (dep: 6)
8. **(M)** `/staff` page + add/edit dialog + activate toggle (shadcn). (dep: 7)
9. **(S)** `/` home placeholder showing resolved identity + role. (dep: 6)
10. **(S)** 401/403 views (Slovak). (dep: 6)
11. **(S)** `lib/realtime/token.ts` mint helper. (dep: 1)
12. **(M)** Tests: unit (shim guard, role assertion, token mint, zod schemas) +
    e2e (manager can CRUD staff; worker gets 403 on `/staff`). (dep: 8, 11)
13. **(S)** Hooks wired (typecheck-on-edit, git-push guard, destructive-DB guard) —
    delivered with `.claude/` scaffolding, verified here.

---

## 4. Acceptance criteria

Concrete and checkable. Shell commands run from repo root.

### 4.1 Build, types, lint, tests

```bash
pnpm install --frozen-lockfile      # exits 0
pnpm typecheck                      # exits 0, no errors
pnpm lint                           # exits 0
pnpm test                           # exits 0; all unit + e2e pass
pnpm build                          # exits 0, production build succeeds
```

### 4.2 Database & migration

```bash
supabase start                                  # local stack up
supabase db reset                               # applies 0001 + seed, exits 0
# RLS is enabled on both foundation tables (expect: 2 rows, both rowsecurity=t):
psql "$LOCAL_DB_URL" -c \
  "select tablename, rowsecurity from pg_tables \
   where tablename in ('staff','audit_log') order by 1;"
# Deny-by-default: anon has zero policies granting access (expect: 0):
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_policies \
   where tablename in ('staff','audit_log') and 'anon' = any(roles);"
```

### 4.3 Auth shim hard-guard (unit test, must pass)

- `NODE_ENV=production` + `DEV_AUTH_EMAIL` set ⇒ `getIdentity()` **ignores** the env
  var and requires the Cloudflare header (test asserts it throws when header absent).
- `NODE_ENV=development` + `DEV_AUTH_EMAIL` set ⇒ returns the dev identity.

```bash
pnpm test auth/identity            # exits 0
```

### 4.4 Authorization (e2e, must pass)

- As `manazer`: `GET /staff` → 200; create/edit/deactivate a worker succeeds.
- As `prevadzka`: `GET /staff` → 403 view; `createStaff` action rejected with
  `ForbiddenError`.
- Manager deactivating their own row → rejected (Slovak error), no lockout.

```bash
pnpm test e2e/staff-permissions    # exits 0
```

### 4.5 Audit log (e2e, must pass)

- After a `createStaff`, an `audit_log` row exists with `action='staff.create'`,
  correct `actor_email`, `entity_type='staff'`, and the new `entity_id`.

```bash
pnpm test e2e/staff-audit          # exits 0
```

### 4.6 Realtime token (unit, must pass)

- `mintRealtimeToken` produces a JWT verifiable with `SUPABASE_JWT_SECRET`, with
  `role='authenticated'`, an `exp` in the future, and a short TTL.

```bash
pnpm test realtime/token           # exits 0
```

### 4.7 Manual checks

- [ ] `/` renders the resolved identity + role; on the seeded local stack it shows
      the manager.
- [ ] `/staff` is usable at 360px width (no horizontal scroll, dialog fits).
- [ ] All visible strings are Slovak.
- [ ] `git push origin main` and `git push --force` are blocked by the hook (spec
      13); a normal commit is not.
