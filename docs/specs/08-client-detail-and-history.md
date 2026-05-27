# Spec 08 — Client detail & service history

> **Status:** draft · **PRD refs:** §10 (client view & history), §13#1 (shared ŠPZ),
> §15#5 · **Depends on:** 02 (clients/cars), 05 (orders), 06 (order lifecycle/services)
> · **Architecture refs:** §2 (authz) · **Data-model refs:** §2.2–§2.4 (clients/cars),
> §2.7–§2.8 (orders/order_services), §2.14 (order_staff), §3 (RLS)

Completes the client detail page (stubbed in spec 02) with the **read-only
chronological service history** per car — including no-shows — aggregated across **all
clients who share a car** (PRD §13#1). This is the "look up by phone, see everything"
surface (PRD §15#5).

---

## 1. Requirements

### 1.1 What this feature does

1. Fill in the **per-car history** section of `/clients/[id]` (spec 02 left it as a
   slot): for each linked car, a **chronological list of orders** — date, services
   performed, worker(s), status (incl. `nedostavil_sa`), and the order note.
2. **Shared-car aggregation:** a car's history shows **every** order on that car,
   regardless of which linked client booked it (dad's 5 + son's 1 = both see 6) —
   PRD §13#1.
3. **Read-only:** edits happen on the order (spec 06); from history a row **links** to
   the order detail (PRD §10).
4. Reachable from a **calendar block** too (PRD §10): clicking an order opens detail,
   which links to the client + this history.
5. Both roles may view (PRD §3: "Zobrazenie histórie klienta — Áno/Áno").

### 1.2 User stories (PRD §10, §15#5)

- As **either role**, I find a client by **phone, name, or ŠPZ** (the unified fuzzy
  search, spec 02) and see all their cars and each car's full service history, including
  past no-shows (PRD §15#5).
- As the **manager**, I can see a client's reliability at a glance (the `nedostavil_sa`
  records are visible — PRD §10 note).
- As **either role**, from a calendar block I jump to the client and their history.

### 1.3 Non-goals

- No editing from history (read-only; edits on the order — spec 06).
- No cross-client *daily* overview — browsing a day/week across all clients is the
  calendar's date navigation (spec 05), not part of this per-client page.
- No pricing totals / invoices (Phase 2 / POS).
- No client/car deletion (data-model §4).

### 1.4 Roles (PRD §3)

Both **manažér** and **prevádzka** may view client history. No mutations in this spec,
so no manager-only actions; reads still go through the edge-auth gate.

---

## 2. Design

### 2.1 Route & UI

| Route | Access | Purpose |
| --- | --- | --- |
| `/clients/[id]` | both | client detail (spec 02 data) + the history section (this spec) |

- Extends the spec 02 page: under each linked car, a chronological (newest-first)
  history list. Each entry: **date/time**, **services** (snapshot names), **worker(s)**,
  **status badge** (color per PRD §5.1, incl. grey `nedostavil_sa`), and the **note**.
- Each entry links to `/orders/[id]` (spec 06) for edits.
- A car shared with other clients shows a small **"zdieľané auto"** hint so the manager
  understands why history may include orders the current client didn't personally book.
- shadcn/ui: `Accordion`/`Card` per car, `Table`/timeline list, `Badge`. Mobile-first
  ≥360px; Slovak copy; empty-state "Zatiaľ žiadna história".

### 2.2 Data access (`lib/actions/clients.ts`, extending spec 02)

| Action | Input | Authz | Notes |
| --- | --- | --- | --- |
| `getClientWithHistory` | `{ clientId }` | both | client + linked cars + per-car order history |

- Resolution:
  1. Load client + `client_cars` → the client's `car_id`s.
  2. For each car, load **all** orders for that `car_id` (not filtered by client) —
     this is the shared-car aggregation (PRD §13#1).
  3. For each order, include snapshotted `order_services` (active + removed, marked),
     assigned `order_staff` → worker names, status, note, `starts_at`.
- **Soft-deleted orders:** cancelled (`deleted_at`) orders are **excluded** from history
  (a cancelled booking isn't a performed service). `nedostavil_sa` **is included** (PRD
  §10 wants no-shows visible). Confirm with client if cancellations should also show;
  default = hide cancellations, show no-shows.
- Reads run server-side via `service_role` behind the edge gate.

### 2.3 Performance

- Index usage: `orders(car_id)` (data-model §2.7) backs the per-car lookup;
  `order_services(order_id)` and `order_staff(order_id)` back the detail joins. History
  is bounded per client; no pagination in Phase 1 (revisit only if a car accrues
  hundreds of orders).

### 2.4 Error handling & loading states

- `getClientWithHistory` for a missing client → 404 view (Slovak).
- Loading skeleton per car section; typed results.

---

## 3. Tasks

1. **(M)** `getClientWithHistory` action: client + cars + per-car aggregated order
   history (shared-car, snapshots, workers, status), excluding `deleted_at`. (dep: 02,
   05, 06)
2. **(M)** History UI on `/clients/[id]`: per-car chronological list, status badges,
   worker(s), note, link to order; "zdieľané auto" hint. (dep: 1)
3. **(S)** Wire calendar block / order detail → client history navigation (verify the
   spec 05/06 links resolve here). (dep: 2)
4. **(M)** Tests: unit (aggregation across shared car; deleted excluded, no-show
   included) + e2e (search phone → cars + full history incl. no-show; shared ŠPZ shows
   both clients' orders; both roles can view). (dep: 2)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck   # exits 0
pnpm lint        # exits 0
pnpm test        # exits 0
pnpm build       # exits 0
```

### 4.2 Aggregation logic (unit, must pass — PRD §13#1)

- A car linked to clients A and B with 5 orders booked under A and 1 under B →
  `getClientWithHistory(A)` and `(B)` **both** return all 6 for that car.
- `nedostavil_sa` orders are **included**; `deleted_at` (cancelled) orders are
  **excluded**.
- Each history entry carries snapshotted service names, worker name(s), status, note.

```bash
pnpm test clients/history-aggregation   # exits 0
```

### 4.3 End-to-end lookup (e2e, must pass — PRD §15#5)

- From the unified search (phone / name / ŠPZ), opening a client renders their cars
  list and each car's full chronological history including at least one `nedostavil_sa`
  entry. (Searching the car's ŠPZ also reaches the client — spec 02 §4.6.)
- A shared-ŠPZ car shows orders booked by the other client too, with the "zdieľané auto"
  hint.
- Clicking a history entry navigates to `/orders/[id]`.

```bash
pnpm test e2e/client-history   # exits 0
```

### 4.4 Authorization (e2e, must pass)

- As **prevádzka** and **manažér**: `/clients/[id]` history renders (both roles may
  view — PRD §3). No mutating controls are present on this page.

```bash
pnpm test e2e/client-history-permissions   # exits 0
```

### 4.5 Manual checks

- [ ] `/clients/[id]` history readable at 360px; newest entries first.
- [ ] Status colors match PRD §5.1; `nedostavil_sa` clearly shown.
- [ ] All visible strings Slovak; empty car shows "Zatiaľ žiadna história".
- [ ] From a calendar block → order detail → client history all reachable.
