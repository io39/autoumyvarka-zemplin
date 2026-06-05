# Spec 06 — Order detail & lifecycle

> **Status:** draft · **PRD refs:** §6 (states & transitions), §7 (notes), §9.3
> (services on existing orders), §11 (audit), §3 (roles) · **Depends on:** 05 (orders,
> calendar) · **Architecture refs:** §2 (authz), §5 (realtime) · **Data-model refs:**
> §2.7 `orders`, §2.8 `order_services`, §2.11 `audit_log`, §1 (`order_status`)

The order **detail view** and everything that happens to an order after creation:
status transitions with role rules, the manager note, worker/manager assignment, and
adding/removing/paying services on an existing order. The `vytvorena → hotova`
transition is the hook spec 07 (SMS) attaches to. All changes are audited and reflect
live in open calendars.

---

## 1. Requirements

### 1.1 What this feature does

1. **Order detail** (PRD §5): opened from a calendar block — client (name, phone), car
   (ŠPZ, model, type), services + durations, assigned worker(s), note, status, action
   buttons by role; the client's history is linked (rendered in spec 08).
2. **Status transitions** with role + sequence rules (PRD §6):
   `vytvorena → hotova` (any role), `hotova → zaplatena` (manager), `vytvorena →
   nedostavil_sa` (manager), and the approved exception `nedostavil_sa → vytvorena`
   (manager — late-arriving client). No *other* return to `vytvorena`; delete only
   before `zaplatena`.
3. **Move time / box** of an existing order (manager only, PRD §3) — re-checked against
   conflicts + opening hours.
4. **Delete / cancel** an order (manager only, before `zaplatena`) — soft-delete.
5. **Manager note** (PRD §7): add/edit, visible to workers but not editable by them,
   shown prominently.
6. **Worker assignment** (PRD §3): either role may assign self or other workers; an
   order can have **multiple** assigned workers (M:N via `order_staff`).
7. **Services on an existing order** (PRD §9.3): add in any state; per-line `paid`;
   remove only if not performed.
8. Every change writes `audit_log` (PRD §11) and reflects via Realtime.

### 1.2 User stories (PRD §6, §7, §9.3)

- As **either role**, I open an order, mark it **hotová** when the wash is done (which
  later triggers the "ready" SMS), then **zaplatená** when paid (manager).
- As the **manager**, I move a late booking to another slot, cancel a no-show as
  **nedostavil sa**, or add a note "neotvárať stredovú konzolu" that workers see but
  can't change.
- As a **worker**, I assign myself to an order and mark it hotová, but I can't move,
  delete, mark no-show, or edit the note.
- As the **manager**, a client asks "rovno aj interiér" mid-wash — I add the service to
  the existing order and mark it unpaid until they pay.

### 1.3 Non-goals

- **Order creation / calendar grid** — spec 05.
- **SMS sending** — spec 07 (this spec exposes the `vytvorena → hotova` event it hooks).
- **Client history rendering** — spec 08 (this spec links to it).
- **Automatic pricing totals / POS** — Phase 2 (PRD §12.1); per-line `paid` is a manual
  flag, no computed balance here.

### 1.4 Roles (PRD §3 matrix — authoritative)

| Action | Manažér | Prevádzka |
| --- | --- | --- |
| View order detail & history | ✅ | ✅ |
| Mark `hotová` / `zaplatená` | ✅ | ✅ |
| Assign / unassign worker(s) (self/other) | ✅ | ✅ |
| Edit order/car data, **move time/box** | ✅ | ❌ |
| **Delete / cancel** order | ✅ | ❌ |
| Mark **`nedostavil sa`** / revert it to `vytvorená` | ✅ | ❌ |
| Add/edit **note** | ✅ | ❌ |
| Add/remove/pay **services** on order | ✅ | ❌ |

> Per-line service edits (§9.3) are manager actions in the PRD ("Úprava údajov
> objednávky"); workers mark status and assign only. `hotová`/`zaplatená` are explicitly
> both-role in the PRD matrix.

---

## 2. Design

### 2.1 Route & UI

| Route | Access | Purpose |
| --- | --- | --- |
| `/orders/[id]` | both | order detail; actions shown per role |

- Opened from a calendar block (spec 05) — may render as a route or a `Sheet`/`Dialog`
  over the calendar; either way deep-linkable at `/orders/[id]`.
- Layout: status badge (color per §5.1), client + car (**ŠPZ + model/type**),
  service list with per-line `paid` toggles, duration + **finish time**, assigned
  **worker(s)** (add/remove), **note shown prominently** (PRD §7), and role-gated
  action buttons.
- Worker-hidden/disabled controls (move, delete, no-show, note edit, service edits) are
  not rendered for `prevadzka`; the server still enforces (defense-in-depth).
- shadcn/ui: `Badge`, `Button`, multi-select / combobox (workers), `Switch`/`Checkbox` (paid),
  `Textarea` (note), `Dialog` (move, confirm delete). Mobile-first ≥360px. Slovak copy.

### 2.2 Status machine (enforced server-side)

```
vytvorena ──(any role)──► hotova ──(manager)──► zaplatena   [terminal]
    │  ▲                    ▲ emits ORDER_READY event (spec 07 SMS)
    │  └──(manager)─────────┐
    └──(manager)──► nedostavil_sa   (frees slot; reversible)
```

- Allowed transitions only; any other (incl. `hotova/zaplatena → vytvorena`) → rejected.
- `setStatus` validates the current→next edge against the matrix **and** the role.
- **Approved exception** `nedostavil_sa → vytvorena` (manager only): a client who was
  marked no-show actually arrives late. Because `nedostavil_sa` freed the slot, the
  revert **re-checks conflict + opening hours** (`isRangeOpen` + the DB constraint) — if
  the slot was rebooked meanwhile, the revert is rejected with a Slovak message
  ("Termín už bol medzitým obsadený"). This overrides PRD §6 for this one edge only.
- `nedostavil_sa` and delete free the box slot (the conflict constraint excludes them —
  data-model §2.7), so the time becomes bookable again immediately (live).
- The `vytvorena → hotova` transition emits an internal **ORDER_READY** signal that
  spec 07 consumes to send the SMS; spec 06 just records the transition + audit.

### 2.3 Server Actions (`lib/actions/orders.ts`, extending spec 05)

All validate with zod; all write `audit_log` (action names below); all re-resolve role.

| Action | Input | Authz | Audit |
| --- | --- | --- | --- |
| `getOrder` | `{ id }` | both | — (read) |
| `setStatus` | `{ id, next }` | matrix (see §2.2) | `order.status_change` `{from,to}` |
| `moveOrder` | `{ id, box, startsAt, durationMin? }` | manager | `order.move` `{from,to}` |
| `deleteOrder` | `{ id }` | manager (pre-`zaplatena`) | `order.delete` |
| `addOrderWorker` | `{ id, staffId }` | both | `order.assign` `{staffId}` |
| `removeOrderWorker` | `{ id, staffId }` | both | `order.unassign` `{staffId}` |
| `setNote` | `{ id, note }` | manager | `order.note_edit` |
| `addOrderService` | `{ id, serviceId, quantity? }` | manager | `order_service.add` |
| `removeOrderService` | `{ orderServiceId }` | manager (if not performed) | `order_service.remove` |
| `setOrderServicePaid` | `{ orderServiceId, paid }` | manager | `order_service.paid` |

- `moveOrder`: re-validates 15-min boundary, opening hours (`isRangeOpen`, spec 04), and
  conflict (DB constraint) — same guarantees as create; friendly Slovak conflict message.
  Optional `durationMin` (used by the wizard's edit "Trvanie" override) updates the order's
  duration too, recomputing `ends_at` and re-checking hours/conflict with the new range.
- `deleteOrder`: rejected if status already `zaplatena` (PRD §6); soft-delete via
  `deleted_at`.
- `addOrderService`: snapshots name/category/duration/price into `order_services`
  (data-model §2.8); recomputes the order's default `duration_min` (respecting a manual
  override) — and since duration changed, re-checks conflict for the new `ends_at`.
- `removeOrderService`: allowed only while the line is not performed (soft `removed_at`).
- `setStatus(next='hotova')` from `vytvorena` emits ORDER_READY after the commit.
- `setStatus(next='zaplatena')` **cascades all non-removed `order_services` lines to
  `paid = true`** after the status update, so a paid order is fully settled and leaves the
  unpaid view (spec 10) without per-line ticking. A line added afterwards re-surfaces it.
- `setStatus(next='vytvorena')` is **only** valid from `nedostavil_sa` (manager): it
  re-checks `isRangeOpen` + the DB conflict constraint before reverting, and is rejected
  if the slot was rebooked. It does **not** re-send the reminder SMS retroactively (spec
  07 handles reminder timing on its own).
- `addOrderWorker` / `removeOrderWorker`: upsert/delete an `order_staff` row
  (data-model §2.14); idempotent (re-adding the same worker is a no-op). Both roles may
  assign or unassign any worker (PRD §3).

### 2.4 Realtime

All mutations write to `orders` / `order_services` / `order_staff`; open calendars
(spec 05) and any open detail view update live via the existing subscription
(data-model §3.1). The `order_staff` table is added to the Realtime publication so
assignment changes propagate too.

### 2.5 Error handling & loading states

- Typed `{ ok: false, message }` results; conflict, closed-hours, illegal-transition,
  and delete-after-paid rejections shown inline in Slovak.
- Detail uses a loading skeleton; actions show pending state and are disabled while
  in-flight to prevent double-submit (e.g. double "hotová").

### 2.6 Data & migrations

Migration `0007_order_staff.sql`: the `order_staff` M:N table (data-model §2.14) with
its PK + indexes + RLS deny-by-default, and added to the Realtime publication. `orders`
and `order_services` already exist (spec 05); new audit `action` strings are values,
not schema. Phase-1 "performed" rule (gating service removal): a line is "performed"
once the order is `hotova` or later, so removal is allowed only while `vytvorena`.

---

## 3. Tasks

0. **(S)** Migration `0007_order_staff.sql` (M:N table, RLS, Realtime publication).
   (dep: spec 05 migration)
1. **(M)** `lib/orders/transitions.ts`: the allowed-edge + role matrix as a pure
   function `canTransition(from, next, role)` (incl. the `nedostavil_sa → vytvorena`
   manager edge) + unit tests. (dep: spec 05)
2. **(M)** Extend `lib/actions/orders.ts`: `setStatus` (incl. no-show revert with
   conflict/hours re-check), `moveOrder`, `deleteOrder`, `addOrderWorker`,
   `removeOrderWorker`, `setNote` with authz + audit. (dep: 0, 1)
3. **(M)** Service-line actions: `addOrderService`, `removeOrderService`,
   `setOrderServicePaid` with snapshotting + duration recompute + audit. (dep: 2)
4. **(S)** ORDER_READY event emission on `vytvorena → hotova` (internal hook surface for
   spec 07; no SMS yet). (dep: 2)
5. **(L)** `/orders/[id]` detail UI with role-gated controls, prominent note, per-line
   paid toggles, move/delete dialogs. (dep: 2, 3)
6. **(M)** Tests: unit (transition matrix, duration recompute) + e2e (each transition;
   worker forbidden on manager-only; move re-checks conflict/hours; add/remove/pay
   service; note worker-readonly; audit rows). (dep: 5)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck   # exits 0
pnpm lint        # exits 0
pnpm test        # exits 0
pnpm build       # exits 0
```

### 4.2 Transition matrix (unit, must pass)

- `canTransition('vytvorena','hotova','prevadzka')` → true.
- `canTransition('hotova','zaplatena','prevadzka')` → true (matrix: both roles).
- `canTransition('vytvorena','nedostavil_sa','prevadzka')` → false; `…,'manazer'` → true.
- `canTransition('nedostavil_sa','vytvorena','manazer')` → true (late-arrival
  exception); `…,'prevadzka')` → false.
- Any **other** transition to `vytvorena` (from `hotova`/`zaplatena`) → false;
  `zaplatena` is terminal.

```bash
pnpm test orders/transitions   # exits 0
```

### 4.3 Role enforcement (e2e, must pass — maps PRD §15#4)

- As **prevádzka**: `setStatus(hotova)`, `addOrderWorker`, `removeOrderWorker` succeed;
  `moveOrder`, `deleteOrder`, `setStatus(nedostavil_sa)`, `setStatus(vytvorena)`,
  `setNote`, `addOrderService` all rejected with `ForbiddenError`.
- As **manažér**: all of the above succeed.
- **Multiple workers:** `addOrderWorker` twice with two different staff → both appear on
  the order (`order_staff` has 2 rows); re-adding the same worker is a no-op (still 2);
  `removeOrderWorker` drops one (1 remains). Audit has `order.assign` ×2 + `order.unassign`.

```bash
pnpm test e2e/order-role-permissions   # exits 0
```

### 4.4 Move / delete / no-show (e2e, must pass)

- `moveOrder` into an occupied box/time → rejected (conflict, Slovak); into a free,
  open slot → succeeds and the calendar reflects the new position live.
- `deleteOrder` on a `zaplatena` order → rejected; on a pre-paid order → soft-deleted
  (`deleted_at` set), slot freed.
- `setStatus(nedostavil_sa)` (manager) → status set, slot freed (re-bookable).
- **No-show revert:** after `nedostavil_sa`, `setStatus(vytvorena)` (manager) → restored
  to `vytvorena` **iff** the slot is still free; if another order took the slot, the
  revert is rejected (Slovak conflict message). As **prevádzka** the revert is rejected
  (`ForbiddenError`).

```bash
pnpm test e2e/order-move-delete e2e/order-noshow-revert   # exits 0
```

### 4.5 Services on an existing order (e2e, must pass — PRD §9.3)

- Add a service to a `zaplatena` order → new line, `paid=false`, order `duration_min`
  recomputed; original lines stay `paid=true`.
- `setOrderServicePaid(true)` → line paid; audit `order_service.paid`.
- `removeOrderService` while `vytvorena` → soft-removed; while `hotova`/`zaplatena`
  (performed) → rejected.

```bash
pnpm test e2e/order-services   # exits 0
```

### 4.6 Note & audit (e2e, must pass — PRD §15#6, §15#9)

- Manager `setNote` → note saved and shown; as **prevádzka** the note renders but the
  edit control is absent and `setNote` is rejected.
- Each mutation writes the expected `audit_log` action (`order.status_change`,
  `order.move`, `order.delete`, `order.assign`, `order.note_edit`,
  `order_service.add/remove/paid`) with `actor_email` and `{from,to}` where applicable.

```bash
pnpm test e2e/order-note-audit   # exits 0
```

### 4.7 ORDER_READY hook (unit, must pass)

- `setStatus` `vytvorena → hotova` emits exactly one ORDER_READY for the order (spec 07
  will subscribe); other transitions emit none.

```bash
pnpm test orders/ready-event   # exits 0
```

### 4.8 Manual checks

- [ ] Detail view shows the note prominently; ŠPZ + model + finish time visible.
- [ ] Status colors match PRD §5.1; live update across two open clients.
- [ ] All visible strings Slovak; action buttons reflect the current role.
- [ ] Usable at 360px.
