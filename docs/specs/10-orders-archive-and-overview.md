# Spec 10 — Orders archive & daily overview

> **Status:** draft · **PRD refs:** §10 (extends — history/overview), §15#5 (related)
> · **Requested:** 2026-05-27 (planning note) · **Depends on:** 05 (orders), 06
> (lifecycle/services) · **Architecture refs:** §2 (authz) · **Data-model refs:** §2.7
> `orders`, §2.8 `order_services`, §2.14 `order_staff`, §3 (RLS)

A **cross-cutting, date-oriented overview** of orders — distinct from the per-client
history (spec 08). It answers "what happened on this day?" across **both boxes, all
vehicles, all services, all clients** — and it stays browsable indefinitely (today's
orders are still readable in 2028, because orders are soft-deleted, never purged —
data-model §4). This is the manager's daily/period read-only ledger.

---

## 1. Requirements

### 1.1 What this feature does

1. A **read-only overview** of orders for a chosen **day** (default) or **date range**,
   showing both **Box 1 and Box 2**, every order's car (ŠPZ + model), services
   performed, assigned worker(s), status, and times.
2. **Durable archive:** any past date is browsable years later (orders are never
   hard-deleted; `nedostavil_sa` and cancelled states are clearly marked).
3. **Filters:** date / range, box, status, and service — so the manager can answer
   "which cars got Tepovanie last month?" or "all paid orders today".
4. A **clean summary** per period: counts by status, totals per box (and, since services
   carry prices, an optional sum of performed/paid services — display only, PRD §13#2).
5. **Distinct from spec 08:** spec 08 is *per client* (by phone/name/ŠPZ); spec 10 is
   *per date*, across everyone.

### 1.2 User stories (planning note 2026-05-27)

- As the **manager**, I open today and see both boxes' orders in one clean overview —
  all vehicles, services, and statuses — without going client by client.
- As the **manager**, in 2028 I can still pull up exactly what was completed on a given
  day in 2026.
- As the **manager**, I filter the archive by box / status / service / date range to
  review a period.

### 1.3 Non-goals

- No editing — read-only; edits happen on the order (spec 06) via links.
- No per-client history (spec 08) — different axis.
- No invoicing / accounting export in Phase 1 (price sums are display-only; CSV export
  could be added later — flagged, not built).
- No live calendar grid — that's spec 05; this is a tabular ledger/overview.

### 1.4 Roles (PRD §3)

PRD §3 doesn't name an "archive" view. It's an administrative overview spanning all
clients, so **manager-only** by default (consistent with §11 audit access reasoning).

> **Confirm with client:** should **prevádzka** also see the daily overview (it could
> help workers see the day's full workload across both boxes)? Default = manager-only;
> easy to widen to both roles if wanted. Flagged, not blocking.

---

## 2. Design

### 2.1 Route & UI

| Route | Access | Purpose |
| --- | --- | --- |
| `/archive` | manager (see §1.4) | date/range overview of orders, both boxes, filters |

- Header: date picker (single day default) or range; quick "dnes / včera / tento
  týždeň / tento mesiac" presets. Filter row: box, status, service.
- Body: a table (or two side-by-side box sections for single-day) with columns —
  time (start–finish), box, **ŠPZ + model**, services (snapshot names), worker(s),
  status badge (PRD §5.1 colors), paid indicator. Newest/earliest order configurable;
  default chronological within the day.
- Summary strip: counts per status, per box; optional price sum (display only).
- Each row links to `/orders/[id]` (spec 06). Mobile-first ≥360px (table stacks);
  Slovak copy; empty-state "Žiadne objednávky v tomto období".

### 2.2 Server Action (`lib/actions/orders.ts`, extending)

| Action | Input (zod) | Authz | Notes |
| --- | --- | --- | --- |
| `getOrdersOverview` | `{ from, to, box?, statuses?[], serviceId?, cursor?, limit? }` | manager | date-range ledger + summary |

- `requireManager()` first (see §1.4). Range query on `orders(starts_at)` /
  `(box, starts_at)` (data-model §2.7); joins snapshotted `order_services` and
  `order_staff` → worker names. **Includes** all statuses by default (incl.
  `nedostavil_sa`); cancelled (`deleted_at`) orders are excluded by default but
  filterable in (a "zrušené" toggle) since the archive is a historical record.
- Returns rows + an aggregate summary (counts by status, per box, optional cents sum).
- **Keyset pagination** on `(starts_at, id)` for large ranges.
- Read via `service_role` behind the edge gate; RLS deny-by-default.

### 2.3 Performance & durability

- Backed by the existing `orders(box, starts_at)` and `(status)` indexes; service filter
  uses `order_services(order_id)` (consider an `order_services(service_id)` index if the
  "by service" filter is heavy — add in this migration if needed).
- Durability is inherent: orders are soft-deleted only, never purged (data-model §4), so
  arbitrarily old dates remain queryable. No archival/cold-storage tier in Phase 1.

### 2.4 Data & migrations

No new tables. If the "by service" filter needs it, migration `0010_orders_overview.sql`
adds an index `order_services(service_id)`; otherwise no migration. No schema change to
orders.

### 2.5 Error handling & loading states

- `getOrdersOverview` for `prevadzka` → 403 (unless widened per §1.4).
- Loading skeleton; range capped to a sane max (e.g. 1 year) per request with paging.

---

## 3. Tasks

1. **(S)** (If needed) migration `0010_orders_overview.sql`: `order_services(service_id)`
   index for the by-service filter. (dep: 05)
2. **(M)** `getOrdersOverview` action: range + box/status/service filters, summary
   aggregate, keyset pagination, `requireManager`. (dep: 05, 06)
3. **(M)** `/archive` page: date/range + presets, filter row, table, summary strip,
   row links. (dep: 2)
4. **(M)** Tests: unit (summary aggregation, filter SQL, keyset paging) + e2e (single-day
   both boxes; range; filter by box/status/service; old date still browsable; worker 403).
   (dep: 3)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck   # exits 0
pnpm lint        # exits 0
pnpm test        # exits 0
pnpm build       # exits 0
```

### 4.2 Daily overview (e2e, must pass)

- Seed orders in both boxes on a date with mixed statuses → `/archive` for that date
  shows **all** of them across Box 1 and Box 2, each with ŠPZ + model, services,
  worker(s), and the correct status color.
- The summary strip reports correct counts per status and per box.

```bash
pnpm test e2e/archive-daily   # exits 0
```

### 4.3 Filters & range (e2e, must pass)

- Filter by box → only that box; by status → only that status; by service → only orders
  containing that service; date range → only orders in range.
- Keyset pagination returns consistent pages over a multi-day range.

```bash
pnpm test e2e/archive-filters   # exits 0
```

### 4.4 Durability (e2e, must pass)

- An order dated far in the past (e.g. 2 years prior) is returned by an overview query
  for that date — proving no purge and that old dates remain browsable.

```bash
pnpm test e2e/archive-durability   # exits 0
```

### 4.5 Authorization (e2e, must pass)

- As **prevádzka**: `/archive` → 403 (default); as **manažér**: renders. (If §1.4 is
  widened to both roles, update this test accordingly.)

```bash
pnpm test e2e/archive-permissions   # exits 0
```

### 4.6 Manual checks

- [ ] `/archive` readable at 360px; both boxes visible for a single day.
- [ ] Status colors match PRD §5.1; cancelled toggle works; `nedostavil_sa` shown.
- [ ] All visible strings Slovak; date presets (dnes/včera/týždeň/mesiac) work.
- [ ] Rows link to `/orders/[id]`.
