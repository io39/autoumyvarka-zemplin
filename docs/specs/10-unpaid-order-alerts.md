# Spec 10 — Unpaid-order alerts

> **Status:** draft · **PRD refs:** §9.3 (per-line paid), §6 (states), §10 (extends) ·
> **Requested:** 2026-05-27 (planning note) · **Depends on:** 06 (status + per-line
> `paid`) · **Architecture refs:** §2 (authz), §5 (realtime) · **Data-model refs:**
> §2.7 `orders`, §2.8 `order_services`, §3 (RLS)

A visible **warning surface** for orders that should be paid but aren't — especially
**unpaid orders carried over from previous days**, and any lingering unpaid from today.
A read-only alert/notification, not a new workflow: it surfaces existing state so money
doesn't slip through.

---

## 1. Requirements

### 1.1 What this feature does

1. Detect **unpaid orders** and present a **count + drill-down list** to the manager.
2. Distinguish **overdue** (unpaid from a **previous day** — the important case) from
   **today's** still-unpaid orders.
3. A persistent **badge/banner** (e.g. in the app header) showing the overdue count,
   linking to the list; the list links each row to its order detail (spec 06).
4. **Read-only / derived** — no new state; it reads order status + per-line `paid`.
5. Updates **live** as orders are paid (Realtime, reusing the existing subscription).

### 1.2 What counts as "unpaid" (definition — confirm with client)

An order is **unpaid** when it is **not** in a fully-settled state. Two candidate
signals exist; Phase-1 default uses **both**, OR-ed:

- the order `status` is `hotova` (washed, not yet `zaplatena`), **or**
- the order has any `order_services` line with `paid = false` that hasn't been removed
  (covers post-hoc services added to an otherwise-paid order — PRD §9.3).

Excluded: `vytvorena` (not washed yet — nothing owed), `nedostavil_sa` (no service),
and soft-deleted orders. **Overdue** = unpaid **and** `starts_at` is before today
(Europe/Bratislava). This definition is isolated in `lib/orders/unpaid.ts` so it's easy
to adjust.

**Settlement (resolved):** advancing an order to `zaplatena` (`setStatus`) **cascades all
its non-removed `order_services` lines to `paid = true`**, so a paid order drops off the
unpaid view without per-line ticking. A service added *after* payment still defaults to
`paid = false` (the post-hoc workflow), so it re-surfaces until ticked.

### 1.3 User stories (planning note 2026-05-27)

- As the **manager**, I see at a glance if any orders from earlier days are still
  unpaid, so I can chase the payment.
- As the **manager**, a banner warns me when something is overdue and I can click
  straight to the offending orders.

### 1.4 Roles (PRD §3)

Payment is a manager concern (only the manager marks `zaplatená` / per-line paid).
The alert is **manager-only** by default; flagged with spec-10-style "confirm if workers
should see it too" — but since workers can't act on payment, default manager-only.

---

## 2. Design

### 2.1 Route & UI

| Surface | Access | Purpose |
| --- | --- | --- |
| Header **badge/banner** | manager | overdue count; click → the list |
| `/unpaid` | manager | list of unpaid orders, newest first |

- Badge shows the **overdue** count (0 → no badge, or a calm "0"); a banner appears only
  when overdue > 0 ("Pozor: {n} nezaplatených objednávok z minulých dní").
- `/unpaid` list: order date, client (name/phone), car (ŠPZ + model), services + unpaid
  amount (display-only cents sum of unpaid lines), status, and an **overdue** marker;
  sorted newest-first (overdue still marked with the "Po termíne" badge). Each row → `/orders/[id]` (spec 06) to mark paid.
- shadcn/ui: `Badge`, `Alert`/banner, `Table`. Mobile-first ≥360px; Slovak copy;
  empty-state "Žiadne nezaplatené objednávky".

### 2.2 Logic (`lib/orders/unpaid.ts`)

- `isUnpaid(order)` and `isOverdue(order, today)` pure predicates encoding §1.2 — unit-
  tested, single place to tune the definition.
- The query selects candidate orders (`status='hotova'` OR exists an unpaid, non-removed
  `order_services` line), excluding deleted, then partitions overdue vs today.

#### Client warning flags

- `computeClientFlags(orders, todayKey)` (pure, unit-tested) reduces a client's orders to
  `{ overdueUnpaidCount, unpaidAmountCents, noShowCount }` — **overdue-unpaid** (same
  `isOverdue` rule) **plus any non-deleted `nedostavil_sa`** (no-show). `hasClientFlags(f)`
  is true when either count > 0.
- Action `getClientFlags({ clientId })` (`lib/actions/orders.ts`, both roles) runs a
  lightweight per-client query and the helper.
- Shared `<ClientFlagBadges>` renders **"Nezaplatené: {n} · {€}"** and **"Nedostavil sa:
  {n}×"** badges — both use the **`vytvorená` status look** (`STATE_COLOR.vytvorena`, red) for
  app-wide consistency; nothing renders when clean. Surfaced in three places: the
  **Nová rezervácia wizard** banner once a client is selected (spec 16), the **client detail
  header** (spec 17), and the **order-detail Klient card** (spec 15).

### 2.3 Server Action (`lib/actions/orders.ts`, extending)

| Action | Input (zod) | Authz | Notes |
| --- | --- | --- | --- |
| `getUnpaidOrders` | `{ scope?: 'overdue'\|'all' }` | manager | list + counts (overdue, today) |
| `getUnpaidCount` | — | manager | lightweight count for the header badge |

- `requireManager()` first. Uses `orders(status)` + `orders(starts_at)` indexes; the
  per-line check joins `order_services(order_id)`. Read via `service_role` behind the
  edge gate; RLS deny-by-default.
- `getUnpaidCount` is cheap (count only) for frequent header polling / Realtime refresh.

### 2.4 Realtime

The badge/list refresh on `orders` / `order_services` changes via the existing
subscription (data-model §3.1) — marking an order `zaplatena` or a line `paid` drops it
from the list live, decrementing the badge. No new realtime plumbing.

### 2.5 Data & migrations

No new tables; derived entirely from existing data. If the candidate query proves heavy,
migration `0010_unpaid_index.sql` may add a partial index
(`orders(starts_at) where status='hotova'`); otherwise no migration. No schema change.

### 2.6 Error handling & loading states

- `getUnpaidOrders`/`getUnpaidCount` for `prevadzka` → `ForbiddenError` (badge hidden in
  worker UI). Loading skeleton on `/unpaid`; banner only renders when overdue > 0.

---

## 3. Tasks

1. **(S)** (If needed) migration `0010_unpaid_index.sql`: partial index for the unpaid
   candidate query. (dep: 05, 06)
2. **(M)** `lib/orders/unpaid.ts` predicates (`isUnpaid`, `isOverdue`) + unit tests.
   (dep: 06)
3. **(M)** `getUnpaidOrders` + `getUnpaidCount` actions with `requireManager`, counts,
   unpaid-amount sum. (dep: 2)
4. **(M)** Header badge/banner + `/unpaid` list page; live refresh via existing
   subscription. (dep: 3)
5. **(M)** Tests: unit (unpaid/overdue definition incl. post-hoc unpaid line; exclusions)
   + e2e (overdue surfaces in badge/list; paying removes it live; worker 403). (dep: 4)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck   # exits 0
pnpm lint        # exits 0
pnpm test        # exits 0
pnpm build       # exits 0
```

### 4.2 Unpaid / overdue definition (unit, must pass)

- `hotova` order from **yesterday** → unpaid **and** overdue.
- `hotova` order from **today** → unpaid, **not** overdue.
- `zaplatena` order with **all** lines paid → not unpaid.
- `zaplatena` order with a **post-hoc unpaid line** (PRD §9.3) → unpaid.
- `vytvorena`, `nedostavil_sa`, and soft-deleted orders → never unpaid.

```bash
pnpm test orders/unpaid   # exits 0
```

### 4.3 Badge, list & live update (e2e, must pass)

- Seed one overdue + one today-unpaid order → header badge shows the **overdue** count;
  banner text mentions previous-day unpaid; `/unpaid` lists both, newest first, with the
  unpaid-amount sum and a link to each order.
- Marking the overdue order `zaplatena` (or its lines paid) removes it from the list and
  decrements the badge **without refresh**.

```bash
pnpm test e2e/unpaid-alerts   # exits 0
```

### 4.4 Authorization (e2e, must pass)

- As **prevádzka**: `/unpaid` → 403; `getUnpaidOrders`/`getUnpaidCount` rejected; no
  badge in worker UI.
- As **manažér**: badge, banner, and list render.

```bash
pnpm test e2e/unpaid-permissions   # exits 0
```

### 4.5 Manual checks

- [ ] Header badge/banner visible to the manager when overdue > 0; absent at 0.
- [ ] `/unpaid` readable at 360px; overdue clearly marked; newest-first ordering.
- [ ] All visible strings Slovak; amounts render as `… €` (display only).
- [ ] Rows link to `/orders/[id]`; paying there clears the alert live.
