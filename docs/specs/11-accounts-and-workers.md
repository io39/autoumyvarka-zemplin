# Spec 11 — Účty (login accounts) & Zamestnanci (workers)

> **Status:** draft · **PRD refs:** §3 (roles & permissions), §11 (audit) · **Depends
> on:** 01 (staff/auth foundation), 06 (order ⇄ worker assignment) · **Architecture
> refs:** §2 (edge auth / authz) · **Data-model refs:** §2.1 `staff`, §2.14
> `order_staff`, §2.11 `audit_log`

Splits the one `staff` table — which today does double duty as both the **login
identity** (email → role) and the pool of **order-assignable workers** — into two
distinct concepts:

- **Účty** (`staff`, unchanged) — login identities. Email → role
  (`manazer`/`prevadzka`), `active`. The thing the edge auth maps to and that every
  `requireManager` check reads. This is what already restricts a *prevádzka* user from
  manager-only features; **no authorization logic changes** in this spec.
- **Zamestnanci** (`workers`, new) — a name + `active`. The **only** thing assignable to
  an order. No email, no role, no login.

The shared-tablet reality (PRD §3): one *prevádzka* login is used at the box, while the
actual people who washed the car are recorded on the order as named **Zamestnanci**.

---

## 1. Requirements

### 1.1 What this feature does

1. **`/staff` page, two manager-only blocks:**
   - **Účty** — the existing staff manager (add/edit/activate/deactivate login
     accounts; email + Manažér/Prevádzka role). Heading renamed; behaviour unchanged.
   - **Zamestnanci** — a new manager that adds/edits/activates/deactivates **workers**
     (name only — no email, no role).
2. **Workers are the order-assignable pool.** The worker dropdown on the order detail
   (spec 06) lists active **workers**, not staff accounts. `order_staff` references
   `workers`, not `staff`.
3. **Soft-delete preserved** for both: deactivate (never hard-delete), so history stays
   intact. An inactive worker can't be newly assigned but stays visible on past orders
   and in client history.
4. **Hide-inactive toggle** on both blocks: a per-block control (default: inactive
   **hidden**) that filters out deactivated accounts/workers from the list, with a way
   to reveal them again. Client-side filter over the already-loaded rows — the actions
   still return active + inactive.
5. **`assigned_by` stays a `staff` (account) reference** — it records *which logged-in
   account* performed the assignment; the assignee is now a worker.
6. Every account/worker mutation writes `audit_log` (PRD §11).

### 1.2 User stories (PRD §3)

- As the **manažér**, I add a login **Účet** for a new prevádzka colleague so they can
  open the app on the tablet with their own identity.
- As the **manažér**, I add **Zamestnanci** "Peter" and "Jano" — names with no logins —
  then assign them to today's orders so the history records who did each wash.
- As the **manažér**, an employee leaves; I **deactivate** their worker entry. They drop
  out of the assignment dropdown but remain on every past order they did.
- As a **prevádzka** user, I'm blocked (403) from the `/staff` page entirely (both
  blocks are manager-only), exactly as before.

### 1.3 Non-goals

- **Authorization / role rules** — unchanged from spec 01/06; this spec only stops
  conflating login with worker. No new permissions.
- **Linking a worker to a login account** — out of scope. Účty and Zamestnanci are
  fully separate lists (a login account is never itself in the worker pool).
- **Worker scheduling / shifts / per-box assignment** — Phase 2; a worker is just a
  name.
- **Self-assignment by a logged-in worker** — gone by construction: logins aren't in
  the worker pool, so assignment is always "pick a name."

### 1.4 Roles (PRD §3)

Both blocks and both `/staff` and the worker CRUD actions are **manager-only**
(`requireManager`). A *prevádzka* user gets the 403 view. Adding/removing a worker *on
an order* remains allowed for **both** roles (unchanged from spec 06 §1.4 — only the
assignee target changes from staff to worker).

---

## 2. Design

### 2.1 Data model — migration `0009_workers.sql`

New `workers` table (mirrors the `staff` soft-delete shape, minus email/role):

```sql
create table workers (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index workers_active_idx on workers (active) where active;
alter table workers enable row level security;   -- deny-by-default (data-model §3)
```

**Repoint `order_staff`** from `staff` to `workers`. On a fresh `supabase db reset` the
seed runs *after* migrations and `seed.sql` does not insert any `order_staff` rows, so
the table is **empty** when `0009` runs — no data migration is required.

```sql
alter table order_staff drop constraint order_staff_staff_id_fkey;
alter table order_staff rename column staff_id to worker_id;
alter table order_staff add constraint order_staff_worker_id_fkey
  foreign key (worker_id) references workers (id);
alter index order_staff_staff_idx rename to order_staff_worker_idx;
```

Deliberate, to minimize churn:
- **Keep the `order_staff` table name** (not renamed to `order_workers`), so its RLS
  policy and `supabase_realtime` publication entry are untouched.
- **Keep `assigned_by → staff(id)`** — the account that performed the assignment.
- The PK stays `(order_id, worker_id)`.

**Seed** (`supabase/seed.sql`): add 2–3 example active workers (e.g. "Peter", "Jano",
"Marek") so the assignment dropdown and e2e have data.

After the migration: regenerate `lib/supabase/database.types.ts`
(`pnpm supabase gen types typescript --local --schema public > lib/supabase/database.types.ts`).

### 2.2 Validation — `lib/validation/workers.ts`

- `createWorkerSchema` = `{ display_name: non-empty trimmed string }`.
- `updateWorkerSchema` = `{ id: uuid, display_name: non-empty trimmed string }`.
- `setWorkerActiveSchema` = `{ id: uuid, active: boolean }`.

No email, no role, no uniqueness on name (two "Jano" are allowed; soft-delete preserves
history either way).

### 2.3 Actions — `lib/actions/workers.ts` (new, mirrors `staff.ts`)

All **manager-only** (`getCurrentStaff` + `requireManager`), zod-validated, audited:

- `listWorkers()` → all workers (active first, then by name).
- `createWorker(input)` → insert; audit `worker.create`.
- `updateWorker(input)` → capture before-state, update name; audit `worker.update`
  (`from`/`to`).
- `setWorkerActive(input)` → soft activate/deactivate; audit
  `worker.activate`/`worker.deactivate`. **No** self-deactivation guard (workers are
  not logins, so there is no lockout risk).

`revalidatePath("/staff")` after each mutation.

### 2.4 Orders integration — `lib/actions/orders.ts`

- `getOrder` embed: `workers:order_staff(*, worker:worker_id(id, display_name, active))`.
- `addOrderWorker` / `removeOrderWorker`: validate against the **`workers`** table
  (exists + `active` on add), insert/delete `worker_id`, audit detail key `worker_id`.
- `orderWorkerSchema` (in `lib/validation/orders.ts`): field `staffId` → `workerId`.

### 2.5 Client history — `lib/actions/clients.ts`

- History embed: `workers:order_staff(worker:worker_id(display_name))`.
- After the split `worker_id → workers` and `assigned_by → staff` point to **different**
  tables, so PostgREST can disambiguate the embed. **Drop the `as unknown as
  HistoryOrderInput[]` cast** if the embed now resolves under the generated types;
  otherwise keep it and note why. Worker display names render the same.

### 2.6 Audit labels — `lib/audit/labels.ts`

Register four new action codes in `ACTION_LABEL`:
`worker.create` → "Vytvorenie zamestnanca", `worker.update` → "Úprava zamestnanca",
`worker.activate` → "Aktivácia zamestnanca", `worker.deactivate` → "Deaktivácia
zamestnanca". The `order.assign`/`order.unassign` summaries return a fixed string and
**do not read** the detail key, so no `summarizeDetails` logic changes.

### 2.7 UI

- **Hide-inactive toggle** (both blocks): a `useState` boolean per block (default
  `true` = hide inactive) bound to a small control — a checkbox or toggle button
  labelled e.g. "Zobraziť neaktívne". When off, rows with `active === false` are
  filtered out of the rendered list; when on, they show dimmed with the existing
  "Neaktívny" badge (current behaviour). Pure client-side filter; no action change.
- **`components/staff/worker-manager.tsx`** (new) — the Zamestnanci block: list with
  active/inactive state, the hide-inactive toggle, add form (name only), edit +
  activate/deactivate, mirroring `StaffManager`'s UX. Slovak strings.
- **`components/staff/staff-manager.tsx`** — add the same hide-inactive toggle to the
  Účty block.
- **`app/staff/page.tsx`** — loads `listStaff()` + `listWorkers()`, renders both blocks
  under headings **"Účty"** and **"Zamestnanci"** (with short Slovak sub-labels). Still
  `requireManager` with the 403 view.
- **`components/orders/order-detail.tsx`** — props/handlers `staffId → workerId`,
  `w.staff_id → w.worker_id` (the `data-worker-id` hook name stays). The available pool
  passed in becomes active **workers**.
- **`app/orders/[id]/page.tsx`** — the dropdown source query changes from
  `staff` (active) to `workers` (active, `id, display_name`).
- Menu link to `/staff` may keep its label or read "Účty a zamestnanci" (cosmetic).

### 2.8 Out-of-scope confirmations

No change to: edge auth (`getCurrentStaff` still reads `staff`), `requireManager`,
`audit_log.actor_staff_id`, the box-overlap exclusion constraint, or any other table.

---

## 3. Tasks

0. **(S)** Migration `0009_workers.sql` (`workers` table + RLS; repoint `order_staff`
   column/FK/index) + seed example workers + regenerate `database.types.ts`. (dep: spec
   06 migration)
1. **(S)** `lib/validation/workers.ts` schemas. (dep: 0)
2. **(M)** `lib/actions/workers.ts`: `listWorkers`, `createWorker`, `updateWorker`,
   `setWorkerActive` with `requireManager` + audit. (dep: 0, 1)
3. **(S)** Repoint orders: `orderWorkerSchema` field, `getOrder` embed,
   `addOrderWorker`/`removeOrderWorker` (workers table check + `worker_id` + audit key),
   `app/orders/[id]/page.tsx` dropdown source. (dep: 0)
4. **(S)** `lib/actions/clients.ts` history embed → `worker_id`; drop the
   `as unknown as` cast if it now resolves. (dep: 0)
5. **(S)** `lib/audit/labels.ts`: four `worker.*` labels. (dep: 0)
6. **(M)** UI: `components/staff/worker-manager.tsx` (with hide-inactive toggle),
   two-block `app/staff/page.tsx`, the same hide-inactive toggle on
   `components/staff/staff-manager.tsx`, `order-detail.tsx` `staffId → workerId` rename.
   (dep: 2, 3)
7. **(M)** Tests: unit (worker action validation; audit-label key
   `staff_id → worker_id`); e2e (`/staff` two blocks; manager add/deactivate worker;
   worker appears/disappears in order dropdown; prevádzka 403 on `/staff`). Update
   `seedOrderFor` to assign by **worker** (not `workerEmail`→staff) and
   `order-role-permissions.spec.ts` `staff_id → worker_id`. (dep: 6)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck   # exits 0
pnpm lint        # exits 0
pnpm test        # exits 0
pnpm build       # exits 0
```

### 4.2 Migration & schema (must hold after `pnpm supabase db reset`)

- `workers` table exists with `display_name`, `active`, `created_at`; RLS enabled, **no**
  anon/authenticated policy (deny-by-default).
- `order_staff` has column `worker_id` (FK → `workers(id)`), **no** `staff_id` column;
  `assigned_by` still FK → `staff(id)`; PK `(order_id, worker_id)`.
- Seed contains ≥ 2 active `workers`.

### 4.3 Worker CRUD & soft-delete (e2e, must pass — maps PRD §3, §11)

- As **manažér** on `/staff`: the page shows **both** an "Účty" block and a
  "Zamestnanci" block.
- Manager adds a worker → it appears active in the Zamestnanci list, audit row
  `worker.create`.
- Manager deactivates the worker → it shows inactive and is **absent** from the order
  detail assignment dropdown; reactivate → present again. Audit `worker.deactivate` /
  `worker.activate`.
- An existing order that already had the worker assigned **still shows that worker**
  after deactivation (history preserved).
- **Hide-inactive toggle:** with a deactivated worker present, the Zamestnanci list does
  **not** show it by default; toggling "Zobraziť neaktívne" reveals it (dimmed,
  "Neaktívny" badge). The Účty block behaves the same for an inactive account.

```bash
pnpm test:e2e staff-workers    # exits 0
```

### 4.4 Role enforcement (e2e, must pass — maps PRD §15#4)

- As **prevádzka**: `/staff` renders the 403 view; `createWorker`, `updateWorker`,
  `setWorkerActive` all rejected with `ForbiddenError`.
- As **prevádzka**: `addOrderWorker` / `removeOrderWorker` **still succeed** (both-role,
  unchanged) — now targeting a worker.
- As **manažér**: all of the above succeed.

```bash
pnpm test:e2e order-role-permissions   # exits 0
```

### 4.5 Audit labels (unit, must pass)

- `ACTION_LABEL["worker.create"]`, `["worker.update"]`, `["worker.activate"]`,
  `["worker.deactivate"]` are non-empty Slovak strings.
- `summarizeDetails("order.assign", { worker_id: "x" })` → "Pracovník priradený";
  `"order.unassign"` → "Pracovník odobratý".

```bash
pnpm test:unit audit/labels   # exits 0
```

### 4.6 No regressions

- The full suite passes on a clean `pnpm supabase db reset` (the spec-06 worker
  assignment, spec-08 client history worker names, and spec-09 assign/unassign audit
  rows all still work against `workers`).
