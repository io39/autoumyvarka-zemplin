# Účty & Zamestnanci Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the overloaded `staff` table into **Účty** (login identities, unchanged) and a new **Zamestnanci** (`workers` — names assignable to orders), repointing `order_staff` to `workers`, with a hide-inactive toggle on both `/staff` blocks.

**Architecture:** A new `workers` table holds order-assignable names (name + `active`, soft-delete). `order_staff.staff_id` is renamed to `worker_id` and re-FK'd to `workers`; `assigned_by` stays a `staff` reference (the account that performed the assignment). Login/authz (`staff`, `getCurrentStaff`, `requireManager`) is untouched. The `/staff` page renders two manager-only blocks; each list has a client-side hide-inactive toggle (default: inactive hidden).

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres (checked-in SQL migrations), shadcn/ui + Tailwind, zod, Vitest (unit), Playwright (e2e, runs against `pnpm build && pnpm start`).

**Spec:** `docs/specs/11-accounts-and-workers.md`

**Conventions reminder:** manager-only mutations call `requireManager`; every mutation writes `audit_log`; RLS deny-by-default on new tables; soft-delete, never hard-delete; all user-facing strings Slovak. Migrations are checked-in SQL, immutable once pushed — this project numbers them `000N_*.sql` (next is `0009`). **Do not push to `main`** (hook-blocked; ask the user).

---

## File map

**Create:**
- `supabase/migrations/0009_workers.sql` — `workers` table + RLS; repoint `order_staff`.
- `lib/validation/workers.ts` — zod schemas for worker actions.
- `lib/actions/workers.ts` — `listWorkers` / `createWorker` / `updateWorker` / `setWorkerActive`.
- `components/staff/worker-manager.tsx` — the Zamestnanci block UI.
- `tests/unit/validation/workers.test.ts` — schema validation unit tests.
- `tests/e2e/staff-workers.spec.ts` — two blocks, worker CRUD, dropdown, 403, hide-inactive.

**Modify:**
- `supabase/seed.sql` — seed 3 active workers.
- `lib/supabase/database.types.ts` — regenerated after the migration.
- `lib/supabase/types.ts` — add `WorkerRow` / `WorkerInsert`.
- `lib/validation/orders.ts` — `orderWorkerSchema` field `staffId → workerId`.
- `lib/actions/orders.ts` — `OrderDetail.workers` type, `getOrder` embed, `addOrderWorker` / `removeOrderWorker`.
- `app/orders/[id]/page.tsx` — dropdown source `staff → workers`; prop `allStaff → allWorkers`.
- `components/orders/order-detail.tsx` — `staffId → workerId`, `w.staff_id → w.worker_id`, `w.staff → w.worker`, prop rename, `StaffLite → WorkerLite`.
- `lib/actions/clients.ts` — history embed `staff:staff_id → worker:worker_id`; drop the `as unknown as` cast if it now resolves.
- `lib/clients/history.ts` — `HistoryOrderInput.workers` shape `staff → worker`.
- `lib/audit/labels.ts` — four `worker.*` action labels.
- `components/staff/staff-manager.tsx` — add hide-inactive toggle.
- `app/staff/page.tsx` — render both Účty + Zamestnanci blocks.
- `tests/e2e/support.ts` — `seedOrderFor` assigns by worker (not `workerEmail`→staff).
- `tests/e2e/order-role-permissions.spec.ts` — `order_staff.staff_id → worker_id`.
- `tests/e2e/staff-permissions.spec.ts` — scope to the Účty block; heading `Zamestnanci → Účty`.
- `tests/e2e/staff-audit.spec.ts` — scope the accounts "Pridať" to the Účty block.
- `tests/unit/audit/labels.test.ts` — assign/unassign detail key `staff_id → worker_id`.

---

## Task 1: Migration — `workers` table + repoint `order_staff`

**Files:**
- Create: `supabase/migrations/0009_workers.sql`
- Modify: `supabase/seed.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)
- Modify: `lib/supabase/types.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_workers.sql`:

```sql
-- 0009_workers.sql — split order-assignable workers out of `staff` (spec 11).
-- `staff` stays the login identity (email -> role). A new `workers` table holds
-- the names assignable to an order. `order_staff` is repointed from `staff` to
-- `workers`; `assigned_by` stays a `staff` reference (the account that assigned).
-- On a fresh `supabase db reset` the seed runs AFTER migrations and seeds no
-- `order_staff` rows, so the table is empty here — no data migration needed.

-- ---------------------------------------------------------------------------
-- workers — order-assignable people (name + active). Soft-disable via active;
-- never hard-delete (history integrity, like staff/services).
-- ---------------------------------------------------------------------------
create table workers (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on table workers is 'Order-assignable people (Zamestnanci). Soft-disable via active; never hard-delete (history integrity). Distinct from staff (login identities).';

create index workers_active_idx on workers (active) where active;

-- Deny-by-default RLS (data-model §3): no anon/authenticated policies; the
-- service_role server client bypasses RLS. The order-detail dropdown reads
-- workers server-side, so no browser read policy is needed.
alter table workers enable row level security;

-- ---------------------------------------------------------------------------
-- Repoint order_staff: staff_id -> worker_id (FK -> workers). Keep the table
-- name, RLS policy, realtime publication entry, and assigned_by (-> staff).
-- ---------------------------------------------------------------------------
alter table order_staff drop constraint order_staff_staff_id_fkey;
alter table order_staff rename column staff_id to worker_id;
alter table order_staff add constraint order_staff_worker_id_fkey
  foreign key (worker_id) references workers (id);
alter index order_staff_staff_idx rename to order_staff_worker_idx;
```

- [ ] **Step 2: Seed example workers**

In `supabase/seed.sql`, immediately after the `staff` insert block (the
`on conflict (email) do nothing;` line, before the service-catalog section), add:

```sql
-- Order-assignable workers (Zamestnanci, spec 11). Names only — no login.
-- Used by local dev and e2e (the order-detail assignment dropdown).
insert into workers (display_name, active) values
  ('Peter', true),
  ('Jano', true),
  ('Marek', true)
on conflict do nothing;
```

- [ ] **Step 3: Apply the migration locally**

Run: `pnpm supabase db reset`
Expected: completes without error; output ends applying `0009_workers.sql` and running the seed.

- [ ] **Step 4: Verify the schema**

Run:
```bash
pnpm supabase db reset >/dev/null 2>&1 && \
psql "$(pnpm -s supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')" -c "\d order_staff" -c "select count(*) from workers;"
```
Expected: `order_staff` shows a `worker_id` column with FK `order_staff_worker_id_fkey` → `workers(id)`, **no** `staff_id` column, `assigned_by` FK → `staff(id)`; `workers` count ≥ 3.

> If `psql` is unavailable, instead open Supabase Studio (`pnpm supabase status` → Studio URL) and confirm the `order_staff` columns and `workers` rows visually.

- [ ] **Step 5: Regenerate the typed client**

Run:
```bash
pnpm supabase gen types typescript --local --schema public > lib/supabase/database.types.ts
```
Expected: the file now contains a `workers:` table block and `order_staff` exposes `worker_id` (not `staff_id`).

- [ ] **Step 6: Add the worker row types**

In `lib/supabase/types.ts`, immediately after the `OrderStaffInsert` line, add:

```typescript
export type WorkerRow = Database["public"]["Tables"]["workers"]["Row"];
export type WorkerInsert = Database["public"]["Tables"]["workers"]["Insert"];
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0009_workers.sql supabase/seed.sql lib/supabase/database.types.ts lib/supabase/types.ts
git commit -m "feat(workers): add workers table and repoint order_staff (spec 11)"
```

---

## Task 2: Worker validation schemas

**Files:**
- Create: `lib/validation/workers.ts`
- Test: `tests/unit/validation/workers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/validation/workers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createWorkerSchema,
  updateWorkerSchema,
  setWorkerActiveSchema,
} from "@/lib/validation/workers";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("worker validation", () => {
  it("accepts and trims a display name", () => {
    expect(createWorkerSchema.parse({ display_name: "  Peter  " })).toEqual({
      display_name: "Peter",
    });
  });

  it("rejects an empty display name", () => {
    expect(() => createWorkerSchema.parse({ display_name: "   " })).toThrow();
  });

  it("update requires a uuid id", () => {
    expect(updateWorkerSchema.parse({ id: UUID, display_name: "Jano" })).toEqual({
      id: UUID,
      display_name: "Jano",
    });
    expect(() => updateWorkerSchema.parse({ id: "nope", display_name: "Jano" })).toThrow();
  });

  it("setActive requires uuid + boolean", () => {
    expect(setWorkerActiveSchema.parse({ id: UUID, active: false })).toEqual({
      id: UUID,
      active: false,
    });
    expect(() => setWorkerActiveSchema.parse({ id: UUID, active: "no" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit validation/workers`
Expected: FAIL — cannot resolve `@/lib/validation/workers`.

- [ ] **Step 3: Write the schemas**

Create `lib/validation/workers.ts`:

```typescript
import { z } from "zod";

/**
 * zod schemas for worker (Zamestnanci) Server Actions (spec 11). Workers are
 * order-assignable names — no email, no role. Validated at every action
 * boundary (CLAUDE.md). No uniqueness on name: two "Jano" are allowed;
 * soft-delete preserves history either way.
 */

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Meno je povinné.")
  .max(120, "Meno je príliš dlhé.");

const idSchema = z.string().uuid("Neplatný identifikátor.");

export const createWorkerSchema = z.object({
  display_name: displayNameSchema,
});

export const updateWorkerSchema = z.object({
  id: idSchema,
  display_name: displayNameSchema,
});

export const setWorkerActiveSchema = z.object({
  id: idSchema,
  active: z.boolean(),
});

export type CreateWorkerInput = z.infer<typeof createWorkerSchema>;
export type UpdateWorkerInput = z.infer<typeof updateWorkerSchema>;
export type SetWorkerActiveInput = z.infer<typeof setWorkerActiveSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit validation/workers`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/validation/workers.ts tests/unit/validation/workers.test.ts
git commit -m "feat(workers): add worker validation schemas (spec 11)"
```

---

## Task 3: Worker Server Actions

**Files:**
- Create: `lib/actions/workers.ts`

Modeled on `lib/actions/staff.ts`, minus email/role and the self-deactivation guard (workers are not logins, so there is no lockout risk).

- [ ] **Step 1: Write the actions**

Create `lib/actions/workers.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/server";
import type { WorkerRow } from "@/lib/supabase/types";
import { type ActionResult, toActionError } from "./result";
import {
  createWorkerSchema,
  updateWorkerSchema,
  setWorkerActiveSchema,
} from "@/lib/validation/workers";

const NOT_FOUND_MESSAGE = "Zamestnanec sa nenašiel.";

/** List all workers (active + inactive). Manager-only — also gated at the page. */
export async function listWorkers(): Promise<WorkerRow[]> {
  const actor = await getCurrentStaff();
  requireManager(actor);

  const { data, error } = await getServiceClient()
    .from("workers")
    .select("*")
    .order("active", { ascending: false })
    .order("display_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createWorker(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const data = createWorkerSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);

    const { data: row, error } = await getServiceClient()
      .from("workers")
      .insert({ display_name: data.display_name })
      .select("id")
      .single();
    if (error) throw error;

    await writeAudit(actor, "worker.create", "worker", row.id, {
      display_name: data.display_name,
    });

    revalidatePath("/staff");
    return { ok: true, id: row.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateWorker(input: unknown): Promise<ActionResult> {
  try {
    const data = updateWorkerSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeError } = await db
      .from("workers")
      .select("display_name")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return { ok: false, message: NOT_FOUND_MESSAGE };

    const { error } = await db
      .from("workers")
      .update({ display_name: data.display_name })
      .eq("id", data.id);
    if (error) throw error;

    await writeAudit(actor, "worker.update", "worker", data.id, {
      from: { display_name: before.display_name },
      to: { display_name: data.display_name },
    });

    revalidatePath("/staff");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setWorkerActive(input: unknown): Promise<ActionResult> {
  try {
    const data = setWorkerActiveSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeError } = await db
      .from("workers")
      .select("active")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return { ok: false, message: NOT_FOUND_MESSAGE };

    const { error } = await db.from("workers").update({ active: data.active }).eq("id", data.id);
    if (error) throw error;

    await writeAudit(
      actor,
      data.active ? "worker.activate" : "worker.deactivate",
      "worker",
      data.id,
      { from: { active: before.active }, to: { active: data.active } },
    );

    revalidatePath("/staff");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/workers.ts
git commit -m "feat(workers): add worker Server Actions (spec 11)"
```

---

## Task 4: Repoint the orders action layer

**Files:**
- Modify: `lib/validation/orders.ts`
- Modify: `lib/actions/orders.ts`
- Modify: `app/orders/[id]/page.tsx`

- [ ] **Step 1: Rename the schema field**

In `lib/validation/orders.ts`, change `orderWorkerSchema`:

```typescript
export const orderWorkerSchema = z.object({
  id: idSchema,
  workerId: idSchema,
});
```

- [ ] **Step 2: Update the `OrderDetail.workers` type**

In `lib/actions/orders.ts`, add `WorkerRow` to the type import from `@/lib/supabase/types` (it currently imports `StaffRow` etc. — add `WorkerRow`), then change the `OrderDetail` interface `workers` line:

```typescript
  workers: Array<OrderStaffRow & { worker: Pick<WorkerRow, "id" | "display_name" | "active"> }>;
```

- [ ] **Step 3: Update the `getOrder` embed**

In `lib/actions/orders.ts` `getOrder`, change the `.select(...)` string's `workers:` segment from `workers:order_staff(*, staff:staff_id(id, display_name, role, active))` to:

```typescript
      "*, client:client_id(*), car:car_id(*), services:order_services(*), workers:order_staff(*, worker:worker_id(id, display_name, active))",
```

- [ ] **Step 4: Repoint `addOrderWorker`**

In `lib/actions/orders.ts` `addOrderWorker`, replace the body's worker handling:
- destructure `const { id, workerId } = orderWorkerSchema.parse(input);`
- the assignee check queries `workers` not `staff`:

```typescript
    // Ensure the assignee exists and is active (FK alone would allow inactive).
    const { data: assignee, error: aErr } = await db
      .from("workers")
      .select("id, active")
      .eq("id", workerId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!assignee || !assignee.active) {
      return { ok: false, message: "Zamestnanec nie je k dispozícii." };
    }
```
- the insert: `.insert({ order_id: id, worker_id: workerId, assigned_by: actor.id });`
- the audit detail: `{ worker_id: workerId }`.

- [ ] **Step 5: Repoint `removeOrderWorker`**

In `lib/actions/orders.ts` `removeOrderWorker`:
- destructure `const { id, workerId } = orderWorkerSchema.parse(input);`
- the delete: `.eq("worker_id", workerId)` (was `.eq("staff_id", staffId)`)
- the audit detail: `{ worker_id: workerId }`.

- [ ] **Step 6: Repoint the dropdown source page**

In `app/orders/[id]/page.tsx`, change the `staff` query to a `workers` query and the prop name:

```typescript
  const db = getServiceClient();
  const [{ data: workerList, error: workerErr }, services, sms] = await Promise.all([
    db.from("workers").select("id, display_name, active").eq("active", true).order("display_name"),
    listServices({ includeInactive: false }),
    getOrderSms({ orderId: id }),
  ]);
  if (workerErr) throw workerErr;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-3 sm:p-6">
      <OrderDetailView
        role={staff.role}
        detail={detail}
        allWorkers={workerList ?? []}
        services={services}
        sms={sms}
      />
    </main>
  );
```

- [ ] **Step 7: Typecheck (expect order-detail errors next task)**

Run: `pnpm typecheck`
Expected: errors only in `components/orders/order-detail.tsx` (prop `allStaff`/`staffId`/`w.staff` mismatches) — fixed in Task 5. No errors in `orders.ts`, `page.tsx`, `orders.ts` validation.

> If errors appear outside `order-detail.tsx`, fix them before moving on.

- [ ] **Step 8: Commit**

```bash
git add lib/validation/orders.ts lib/actions/orders.ts app/orders/[id]/page.tsx
git commit -m "feat(orders): repoint worker assignment from staff to workers (spec 11)"
```

---

## Task 5: Repoint the order-detail component

**Files:**
- Modify: `components/orders/order-detail.tsx`

- [ ] **Step 1: Replace the lite type and import**

In `components/orders/order-detail.tsx`:
- In the `@/lib/supabase/types` import, remove `StaffRow` if now unused and add `WorkerRow`. (Keep `StaffRole`, `SmsMessageRow`.)
- Replace the `StaffLite` type alias:

```typescript
type WorkerLite = Pick<WorkerRow, "id" | "display_name" | "active">;
```

- [ ] **Step 2: Rename the prop**

In the `Props` interface, change `allStaff: StaffLite[];` to `allWorkers: WorkerLite[];`.

In the component signature, change `export function OrderDetailView({ role, detail, allStaff, services, sms }: Props)` to use `allWorkers`.

- [ ] **Step 3: Update the assignable filter**

Replace the `assignableStaff` computation:

```typescript
  const assignableWorkers = allWorkers.filter(
    (w0) => !detail.workers.some((w) => w.worker_id === w0.id),
  );
```

- [ ] **Step 4: Update the `WorkersSection` usage**

In the JSX, change the `WorkersSection` props:

```tsx
      <WorkersSection
        workers={detail.workers}
        assignable={assignableWorkers}
        pending={pending}
        onAdd={(workerId) =>
          call("Zamestnanec pridaný.", () =>
            addOrderWorker({ id: order.id, workerId }),
          )
        }
        onRemove={(workerId) =>
          call("Zamestnanec odobraný.", () =>
            removeOrderWorker({ id: order.id, workerId }),
          )
        }
      />
```

- [ ] **Step 5: Update the `WorkersSection` definition**

Change the `WorkersSection` function's prop types and body:
- `assignable: WorkerLite[];`
- `onAdd: (workerId: string) => void;`
- `onRemove: (workerId: string) => void;`
- in the list map: `key={w.worker_id}`, `data-worker-id={w.worker_id}`, `<span>{w.worker.display_name}</span>`, `onClick={() => onRemove(w.worker_id)}`.

(The dropdown `assignable.map((s) => ...)` already keys on `s.id` / `s.display_name`, which exist on `WorkerLite` — no change there beyond the type.)

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0 (all worker-repoint errors resolved).

- [ ] **Step 7: Commit**

```bash
git add components/orders/order-detail.tsx
git commit -m "feat(orders): order-detail worker UI reads workers not staff (spec 11)"
```

---

## Task 6: Repoint client history

**Files:**
- Modify: `lib/clients/history.ts`
- Modify: `lib/actions/clients.ts`

- [ ] **Step 1: Update the history input shape**

In `lib/clients/history.ts`:
- change the `HistoryOrderInput.workers` field type to:

```typescript
  workers: Array<{ worker: { display_name: string } | null }>;
```
- in `toEntry`, change the worker mapping from `w.staff?.display_name` to `w.worker?.display_name`.

- [ ] **Step 2: Update the embed and try dropping the cast**

In `lib/actions/clients.ts` `getClientWithHistory`, change the orders `.select(...)` `workers:` segment to `workers:order_staff(worker:worker_id(display_name))`. Then update the comment + remove the cast — change:

```typescript
  const histories = buildCarHistories(
    cars,
    (orders ?? []) as unknown as HistoryOrderInput[],
    sharedCarIds,
  );
```
to:

```typescript
  // After spec 11, worker_id -> workers and assigned_by -> staff point to
  // different tables, so PostgREST resolves the `worker:worker_id` embed cleanly.
  const histories = buildCarHistories(cars, (orders ?? []) as HistoryOrderInput[], sharedCarIds);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0.

> **If typecheck fails** on the `buildCarHistories` call (the embed still resolves to an array/ambiguous type under the generated types), restore the original cast and comment:
> ```typescript
>   // order_staff embeds a single worker per row; the typed client widens it,
>   // so cast to the runtime shape (e2e-verified).
>   const histories = buildCarHistories(
>     cars,
>     (orders ?? []) as unknown as HistoryOrderInput[],
>     sharedCarIds,
>   );
> ```
> Then re-run `pnpm typecheck` (expect 0) and continue.

- [ ] **Step 4: Commit**

```bash
git add lib/clients/history.ts lib/actions/clients.ts
git commit -m "feat(clients): client history reads order worker names from workers (spec 11)"
```

---

## Task 7: Audit labels for worker actions

**Files:**
- Modify: `lib/audit/labels.ts`
- Modify: `tests/unit/audit/labels.test.ts`

- [ ] **Step 1: Update the assign/unassign test key**

In `tests/unit/audit/labels.test.ts`, change the three `{ staff_id: "x" }` occurrences (lines ~60, 61, 70) to `{ worker_id: "x" }`. The expected Slovak strings ("Pracovník priradený" / "Pracovník odobratý") are unchanged.

- [ ] **Step 2: Add a test for the new worker labels**

In the same file, inside the existing `describe` for `ACTION_LABEL`, add:

```typescript
  it("labels worker actions", () => {
    expect(ACTION_LABEL["worker.create"]).toBe("Vytvorenie zamestnanca");
    expect(ACTION_LABEL["worker.update"]).toBe("Úprava zamestnanca");
    expect(ACTION_LABEL["worker.activate"]).toBe("Aktivácia zamestnanca");
    expect(ACTION_LABEL["worker.deactivate"]).toBe("Deaktivácia zamestnanca");
  });
```

> Match the placement/style of the existing label assertions in this file; if labels are asserted in a different structure, follow that structure.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test:unit audit/labels`
Expected: FAIL — `ACTION_LABEL["worker.create"]` is `undefined`.

- [ ] **Step 4: Add the labels**

In `lib/audit/labels.ts`, in `ACTION_LABEL`, immediately after the four `staff.*` entries, add:

```typescript
  // workers (spec 11)
  "worker.create": "Vytvorenie zamestnanca",
  "worker.update": "Úprava zamestnanca",
  "worker.activate": "Aktivácia zamestnanca",
  "worker.deactivate": "Deaktivácia zamestnanca",
```

Also add `worker: "Zamestnanec"` to the `ENTITY_LABEL` map (after `staff: "Zamestnanec"`):

```typescript
  worker: "Zamestnanec",
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:unit audit/labels`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/audit/labels.ts tests/unit/audit/labels.test.ts
git commit -m "feat(audit): add worker.* action labels (spec 11)"
```

---

## Task 8: UI — two `/staff` blocks + hide-inactive toggles

**Files:**
- Create: `components/staff/worker-manager.tsx`
- Modify: `components/staff/staff-manager.tsx`
- Modify: `app/staff/page.tsx`

- [ ] **Step 1: Create the WorkerManager component**

Create `components/staff/worker-manager.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createWorker, updateWorker, setWorkerActive } from "@/lib/actions/workers";
import type { WorkerRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EditTarget = WorkerRow | "new" | null;

export function WorkerManager({ initialWorkers }: { initialWorkers: WorkerRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditTarget>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(
    () => (showInactive ? initialWorkers : initialWorkers.filter((w) => w.active)),
    [initialWorkers, showInactive],
  );

  function toggleActive(row: WorkerRow) {
    startTransition(async () => {
      const result = await setWorkerActive({ id: row.id, active: !row.active });
      if (result.ok) {
        toast.success(row.active ? "Zamestnanec deaktivovaný." : "Zamestnanec aktivovaný.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-4" data-section="workers-manager">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Zamestnanci</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Skryť neaktívnych" : "Zobraziť neaktívnych"}
          </Button>
          <Button onClick={() => setEditing("new")}>Pridať</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Mená pracovníkov, ktorých možno priradiť k objednávke. Bez prihlásenia.
      </p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Meno</TableHead>
              <TableHead>Stav</TableHead>
              <TableHead className="text-right">Akcie</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Žiadni zamestnanci.
                </TableCell>
              </TableRow>
            )}
            {visible.map((row) => (
              <TableRow
                key={row.id}
                data-worker-id={row.id}
                className={row.active ? "" : "opacity-60"}
              >
                <TableCell className="font-medium">{row.display_name}</TableCell>
                <TableCell>
                  <Badge variant={row.active ? "outline" : "destructive"}>
                    {row.active ? "Aktívny" : "Neaktívny"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                      Upraviť
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => toggleActive(row)}
                    >
                      {row.active ? "Deaktivovať" : "Aktivovať"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <WorkerDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function WorkerDialog({
  target,
  onClose,
  onSaved,
}: {
  target: EditTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = target === "new";
  const row = target && target !== "new" ? target : null;
  const [pending, startTransition] = useTransition();
  const formKey = isNew ? "new" : (row?.id ?? "closed");

  function onSubmit(formData: FormData) {
    const display_name = String(formData.get("display_name") ?? "");
    startTransition(async () => {
      if (isNew) {
        const result = await createWorker({ display_name });
        if (result.ok) {
          toast.success("Zamestnanec pridaný.");
          onSaved();
        } else {
          toast.error(result.message);
        }
      } else if (row) {
        const result = await updateWorker({ id: row.id, display_name });
        if (result.ok) {
          toast.success("Zmeny uložené.");
          onSaved();
        } else {
          toast.error(result.message);
        }
      }
    });
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form key={formKey} action={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isNew ? "Pridať zamestnanca" : "Upraviť zamestnanca"}</DialogTitle>
            <DialogDescription>
              {isNew ? "Zadajte meno nového zamestnanca." : "Upravte meno zamestnanca."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="worker_display_name">Meno</Label>
              <Input
                id="worker_display_name"
                name="display_name"
                required
                defaultValue={row?.display_name ?? ""}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušiť
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukladám…" : "Uložiť"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add the hide-inactive toggle to StaffManager**

In `components/staff/staff-manager.tsx`:
- add `useMemo` to the React import: `import { useMemo, useState, useTransition } from "react";`
- after the `pending` transition state, add:

```typescript
  const [showInactive, setShowInactive] = useState(false);
  const visible = useMemo(
    () => (showInactive ? initialStaff : initialStaff.filter((s) => s.active)),
    [initialStaff, showInactive],
  );
```
- add `data-section="accounts-manager"` to the component's root div (currently `<div className="space-y-4">` → `<div className="space-y-4" data-section="accounts-manager">`) so e2e can scope to the Účty block now that two "Pridať" buttons exist.
- change the heading `<h1>Zamestnanci</h1>` to `<h2 className="text-xl font-semibold">Účty</h2>` and put the toggle next to the "Pridať" button:

```tsx
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Účty</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Skryť neaktívne" : "Zobraziť neaktívne"}
          </Button>
          <Button onClick={() => setEditing("new")}>Pridať</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Prihlasovacie účty (email → rola). Určujú oprávnenia v aplikácii.
      </p>
```
- in the table body, change `{initialStaff.length === 0 && (` to `{visible.length === 0 && (` and `{initialStaff.map((row) => (` to `{visible.map((row) => (`.
- wrap the outer `<div className="space-y-4">` content as-is (it already groups the block); the page (Task 8 Step 3) renders the heading inside this component, so remove the previously top-level `<h1>` semantics by using `<h2>` as above.

- [ ] **Step 3: Render both blocks on the staff page**

Replace `app/staff/page.tsx` with:

```tsx
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { listStaff } from "@/lib/actions/staff";
import { listWorkers } from "@/lib/actions/workers";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { StaffManager } from "@/components/staff/staff-manager";
import { WorkerManager } from "@/components/staff/worker-manager";

export default async function StaffPage() {
  let currentStaffId: string;
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
    currentStaffId = actor.id;
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const [staff, workers] = await Promise.all([listStaff(), listWorkers()]);

  return (
    <main className="mx-auto max-w-3xl space-y-10 p-4 sm:p-6">
      <StaffManager initialStaff={staff} currentStaffId={currentStaffId} />
      <WorkerManager initialWorkers={workers} />
    </main>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/staff/worker-manager.tsx components/staff/staff-manager.tsx app/staff/page.tsx
git commit -m "feat(staff): two blocks (Účty + Zamestnanci) with hide-inactive toggle (spec 11)"
```

---

## Task 9: Update e2e fixtures and existing staff/worker tests

**Files:**
- Modify: `tests/e2e/support.ts`
- Modify: `tests/e2e/order-role-permissions.spec.ts`
- Modify: `tests/e2e/staff-permissions.spec.ts`
- Modify: `tests/e2e/staff-audit.spec.ts`

- [ ] **Step 1: Repoint `seedOrderFor` to assign by worker**

In `tests/e2e/support.ts`, change the `seedOrderFor` options + assignment block. Replace the `workerEmail?: string;` option with `workerName?: string;` and the trailing assignment block:

```typescript
  if (opts.workerName) {
    const { data: worker } = await db
      .from("workers")
      .select("id")
      .eq("display_name", opts.workerName)
      .single();
    await db.from("order_staff").insert({
      order_id: order.id,
      worker_id: worker!.id,
      assigned_by: manager!.id,
    });
  }
```

> Then update the `seedOrderFor` options type: `workerName?: string;` (was `workerEmail?: string;`).

- [ ] **Step 2: Find and fix callers of `seedOrderFor({ workerEmail })`**

Run: `grep -rn "workerEmail" tests/`
For each hit, change `workerEmail: WORKER_EMAIL` (or similar) to `workerName: "Peter"` (a seeded worker). If a test asserted on the worker's *display name* being the staff "Tester Prevádzka", update that assertion to "Peter".

Run: `grep -rn "workerEmail" tests/`
Expected: no remaining hits.

- [ ] **Step 3: Repoint `order_staff.staff_id` reads in role-permissions**

In `tests/e2e/order-role-permissions.spec.ts`, change every `order_staff` query `.select("staff_id")` to `.select("worker_id")`, every `rows![0].staff_id` to `rows![0].worker_id`, and the duplicate-insert object `staff_id: rows![0].staff_id` to `worker_id: rows![0].worker_id`. (The `assigned_by: workerStaff!.id` stays — `assigned_by` is still a staff reference.)

> The "multiple workers" manager test picks two options from `#worker-select`; the seed now has 3 active workers, so two distinct options exist. The `assigned_by` for the duplicate-insert uses an existing staff id — keep whatever staff id the test already resolves.

- [ ] **Step 4: Fix `staff-permissions.spec.ts` for the two-block layout**

Two blocks now mean two "Pridať" buttons and a relocated heading. Edit
`tests/e2e/staff-permissions.spec.ts`:
- Define an accounts-block locator at the top of each manager test:
  `const accounts = page.locator('[data-section="accounts-manager"]');`
- "can open /staff" test: change line 9 to
  `await expect(page.getByRole("heading", { name: "Účty", exact: true })).toBeVisible();`
  and line 10 to `await expect(accounts.getByRole("button", { name: "Pridať" })).toBeVisible();`
- "can create a worker…" test: change `await page.getByRole("button", { name: "Pridať" }).click();`
  to `await accounts.getByRole("button", { name: "Pridať" }).click();` (the dialog
  with the Email field is the accounts dialog). The rest (`getByLabel("Email")`, the
  email-filtered row, Deactivate) is unambiguous and unchanged.
- "cannot deactivate their own account" test: unchanged (row is filtered by
  `MANAGER_EMAIL`, only in the accounts block).
- worker 403 test: change the heading assertion to
  `await expect(page.getByRole("heading", { name: "Účty", exact: true })).toHaveCount(0);`

- [ ] **Step 5: Fix `staff-audit.spec.ts` for the two-block layout**

Edit `tests/e2e/staff-audit.spec.ts`: add
`const accounts = page.locator('[data-section="accounts-manager"]');` after `page.goto("/staff")`,
and change line 12 `await page.getByRole("button", { name: "Pridať" }).click();` to
`await accounts.getByRole("button", { name: "Pridať" }).click();`. Everything else
(staff.create / staff.deactivate audit assertions) is unchanged — this spec still
exercises the **accounts** block, which keeps the `staff.*` audit codes.

- [ ] **Step 6: Run the affected e2e suites**

Run: `pnpm test:e2e order-role-permissions && pnpm test:e2e staff-permissions && pnpm test:e2e staff-audit`
Expected: all PASS.

> e2e runs against a production build; if the runner builds first, allow it time. If a worker-name assertion fails, align it with a seeded name from Step 2.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/support.ts tests/e2e/order-role-permissions.spec.ts tests/e2e/staff-permissions.spec.ts tests/e2e/staff-audit.spec.ts
git commit -m "test(e2e): adapt order + staff specs to workers split and two-block /staff (spec 11)"
```

---

## Task 10: New e2e — two blocks, worker CRUD, dropdown, 403, hide-inactive

**Files:**
- Create: `tests/e2e/staff-workers.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Create `tests/e2e/staff-workers.spec.ts` (model the auth-header + serviceClient pattern on the existing `tests/e2e/staff-permissions.spec.ts`):

```typescript
import { test, expect } from "@playwright/test";
import {
  MANAGER_EMAIL,
  WORKER_EMAIL,
  accessHeaders,
  serviceClient,
  seedOrder,
} from "./support";

test.describe("staff page — Účty + Zamestnanci (manager)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("shows both blocks and supports worker CRUD + hide-inactive", async ({ page }) => {
    await page.goto("/staff");

    // Both block headings present.
    await expect(page.getByRole("heading", { name: "Účty", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Zamestnanci", exact: true })).toBeVisible();

    const block = page.locator('[data-section="workers-manager"]');

    // Add a worker.
    const name = `QA Worker ${Date.now()}`;
    await block.getByRole("button", { name: "Pridať", exact: true }).click();
    await page.getByLabel("Meno").fill(name);
    await page.getByRole("button", { name: "Uložiť" }).click();
    await expect(page.getByText("Zamestnanec pridaný.")).toBeVisible();
    await expect(block.getByText(name)).toBeVisible();

    // Deactivate it.
    const db = serviceClient();
    const { data: created } = await db
      .from("workers")
      .select("id")
      .eq("display_name", name)
      .single();
    await block
      .locator(`[data-worker-id="${created!.id}"]`)
      .getByRole("button", { name: "Deaktivovať" })
      .click();
    await expect(page.getByText("Zamestnanec deaktivovaný.")).toBeVisible();

    // Default view hides it.
    await expect(block.locator(`[data-worker-id="${created!.id}"]`)).toHaveCount(0);

    // Toggle reveals it (dimmed, "Neaktívny").
    await block.getByRole("button", { name: "Zobraziť neaktívnych" }).click();
    await expect(block.locator(`[data-worker-id="${created!.id}"]`)).toBeVisible();
    await expect(
      block.locator(`[data-worker-id="${created!.id}"]`).getByText("Neaktívny"),
    ).toBeVisible();
  });

  test("deactivated worker drops out of the order assignment dropdown", async ({ page }) => {
    const db = serviceClient();
    const name = `Drop ${Date.now()}`;
    const { data: w } = await db
      .from("workers")
      .insert({ display_name: name })
      .select("id")
      .single();

    const { orderId } = await seedOrder();

    await page.goto(`/orders/${orderId}`);
    await page.locator("#worker-select").click();
    await expect(page.getByRole("option", { name })).toBeVisible();
    await page.keyboard.press("Escape");

    // Deactivate and reload — option gone.
    await db.from("workers").update({ active: false }).eq("id", w!.id);
    await page.reload();
    await page.locator("#worker-select").click();
    await expect(page.getByRole("option", { name })).toHaveCount(0);
  });
});

test.describe("staff page — worker (prevadzka) is blocked", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("prevadzka gets 403 on /staff", async ({ page }) => {
    await page.goto("/staff");
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Zamestnanci", exact: true })).toHaveCount(0);
  });
});
```

> Verified against the codebase: `seedOrder()` (returns `{ orderId, ... }`), `serviceClient`, `accessHeaders`, `MANAGER_EMAIL`, `WORKER_EMAIL` are all exported from `tests/e2e/support.ts`; the 403 view copy is exactly `"Nemáte oprávnenie"`. The order-detail worker dropdown trigger is `#worker-select` and options render the worker `display_name`.

- [ ] **Step 2: Run the new spec**

Run: `pnpm test:e2e staff-workers`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/staff-workers.spec.ts
git commit -m "test(e2e): staff page two blocks, worker CRUD, dropdown, 403, hide-inactive (spec 11)"
```

---

## Task 11: Full verification & spec acceptance

**Files:** none (verification only).

- [ ] **Step 1: Clean DB + full suite**

Run:
```bash
pnpm supabase db reset && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Expected: every command exits 0. `pnpm test` runs the full unit + e2e suite.

- [ ] **Step 2: Verify spec acceptance criteria**

Open `docs/specs/11-accounts-and-workers.md` §4 and confirm each criterion:
- §4.2 schema: `workers` exists (RLS, no anon policy); `order_staff` has `worker_id` FK → `workers`, no `staff_id`, `assigned_by` → `staff`; seed ≥ 2 workers. (Re-run the Task 1 Step 4 check.)
- §4.3 worker CRUD + soft-delete + hide-inactive: covered by `staff-workers`.
- §4.4 role enforcement: covered by `order-role-permissions` + `staff-workers` 403.
- §4.5 audit labels: covered by `audit/labels`.
- §4.6 no regressions: full suite green on clean reset.

- [ ] **Step 3: Mark the spec done in continue.md**

Update `continue.md` with a spec-11 DONE entry (mirroring the style of specs 01–10): note the migration, the workers table, the order_staff repoint, the two-block `/staff`, the hide-inactive toggle, final unit + e2e counts, and any code-review follow-ups. Update the open-questions list if the worker-credit double-entry note (spec §1.3) is worth surfacing to the client.

- [ ] **Step 4: Commit + request code review**

```bash
git add continue.md
git commit -m "docs: mark spec 11 done in continue.md"
```

Then run the `code-reviewer` subagent against the spec-11 changes and address any must-fix / should-fix findings. **Do not push to `main`** — ask the user to push from their own terminal.

---

## Notes for the implementer

- **Order of operations matters:** Task 1 (migration + regenerated types) must land before Tasks 4–6 typecheck cleanly. Tasks 4 and 5 together fix the worker repoint — `pnpm typecheck` is only fully green after Task 5.
- **The `as unknown as` cast (Task 6)** may or may not be removable depending on how PostgREST's generated types resolve the renamed embed. The step has an explicit fallback — don't fight the type checker, restore the cast if needed.
- **e2e runs against a production build** (`pnpm build && pnpm start`), not `pnpm dev` (see `tests/README.md`). Targeted runs: `pnpm test:e2e <path>`, `pnpm test:unit <path>`.
- **Seeded worker names** ("Peter", "Jano", "Marek") are referenced by the e2e fixtures — keep them in sync if you rename them.
- **No authz changes:** `getCurrentStaff`, `requireManager`, `audit_log.actor_staff_id` all still read `staff`. If you find yourself touching those, stop — it's out of scope.
