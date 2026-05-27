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
   (ŠPZ, model, type), services + durations, assigned worker, note, status, action
   buttons by role; the client's history is linked (rendered in spec 08).
2. **Status transitions** with role + sequence rules (PRD §6):
   `vytvorena → hotova` (any role), `hotova → zaplatena` (manager), `vytvorena →
   nedostavil_sa` (manager). No return to `vytvorena`; delete only before `zaplatena`.
3. **Move time / box** of an existing order (manager only, PRD §3) — re-checked against
   conflicts + opening hours.
4. **Delete / cancel** an order (manager only, before `zaplatena`) — soft-delete.
5. **Manager note** (PRD §7): add/edit, visible to workers but not editable by them,
   shown prominently.
6. **Worker assignment** (PRD §3): either role may assign self or another worker.
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
| Assign worker (self/other) | ✅ | ✅ |
| Edit order/car data, **move time/box** | ✅ | ❌ |
| **Delete / cancel** order | ✅ | ❌ |
| Mark **`nedostavil sa`** | ✅ | ❌ |
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
  worker, **note shown prominently** (PRD §7), and role-gated action buttons.
- Worker-hidden/disabled controls (move, delete, no-show, note edit, service edits) are
  not rendered for `prevadzka`; the server still enforces (defense-in-depth).
- shadcn/ui: `Badge`, `Button`, `Select` (worker), `Switch`/`Checkbox` (paid),
  `Textarea` (note), `Dialog` (move, confirm delete). Mobile-first ≥360px. Slovak copy.

### 2.2 Status machine (enforced server-side)

```
vytvorena ──(any role)──► hotova ──(manager)──► zaplatena   [terminal]
    │                       ▲ emits ORDER_READY event (spec 07 SMS)
    └──(manager)──► nedostavil_sa   [terminal, frees slot]
```

- Allowed transitions only; any other (incl. back to `vytvorena`) → rejected.
- `setStatus` validates the current→next edge against the matrix **and** the role.
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
| `moveOrder` | `{ id, box, startsAt }` | manager | `order.move` `{from,to}` |
| `deleteOrder` | `{ id }` | manager (pre-`zaplatena`) | `order.delete` |
| `assignWorker` | `{ id, staffId\|null }` | both | `order.assign` `{from,to}` |
| `setNote` | `{ id, note }` | manager | `order.note_edit` |
| `addOrderService` | `{ id, serviceId, quantity? }` | manager | `order_service.add` |
| `removeOrderService` | `{ orderServiceId }` | manager (if not performed) | `order_service.remove` |
| `setOrderServicePaid` | `{ orderServiceId, paid }` | manager | `order_service.paid` |

- `moveOrder`: re-validates 15-min boundary, opening hours (`isRangeOpen`, spec 04), and
  conflict (DB constraint) — same guarantees as create; friendly Slovak conflict message.
- `deleteOrder`: rejected if status already `zaplatena` (PRD §6); soft-delete via
  `deleted_at`.
- `addOrderService`: snapshots name/category/duration/price into `order_services`
  (data-model §2.8); recomputes the order's default `duration_min` (respecting a manual
  override) — and since duration changed, re-checks conflict for the new `ends_at`.
- `removeOrderService`: allowed only while the line is not performed (soft `removed_at`).
- `setStatus(next='hotova')` from `vytvorena` emits ORDER_READY after the commit.

### 2.4 Realtime

All mutations write to `orders` / `order_services`; open calendars (spec 05) and any
open detail view update live via the existing subscription (data-model §3.1). No new
realtime plumbing.

### 2.5 Error handling & loading states

- Typed `{ ok: false, message }` results; conflict, closed-hours, illegal-transition,
  and delete-after-paid rejections shown inline in Slovak.
- Detail uses a loading skeleton; actions show pending state and are disabled while
  in-flight to prevent double-submit (e.g. double "hotová").

### 2.6 Data & migrations

No schema changes — `orders` and `order_services` already exist (spec 05). New audit
`action` strings are values, not schema. If a "performed" flag is needed to gate
service removal beyond status, define it here; Phase-1 default: a line is "performed"
once the order is `hotova` or later, so removal is allowed only while `vytvorena`.

---

## 3. Tasks

1. **(M)** `lib/orders/transitions.ts`: the allowed-edge + role matrix as a pure
   function `canTransition(from, next, role)` + unit tests. (dep: spec 05)
2. **(M)** Extend `lib/actions/orders.ts`: `setStatus`, `moveOrder`, `deleteOrder`,
   `assignWorker`, `setNote` with authz + audit + conflict/hours re-checks. (dep: 1)
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
- Any transition **to** `vytvorena` → false; `zaplatena`/`nedostavil_sa` are terminal.

```bash
pnpm test orders/transitions   # exits 0
```

### 4.3 Role enforcement (e2e, must pass — maps PRD §15#4)

- As **prevádzka**: `setStatus(hotova)` and `assignWorker` succeed; `moveOrder`,
  `deleteOrder`, `setStatus(nedostavil_sa)`, `setNote`, `addOrderService` all rejected
  with `ForbiddenError`.
- As **manažér**: all of the above succeed.

```bash
pnpm test e2e/order-role-permissions   # exits 0
```

### 4.4 Move / delete / no-show (e2e, must pass)

- `moveOrder` into an occupied box/time → rejected (conflict, Slovak); into a free,
  open slot → succeeds and the calendar reflects the new position live.
- `deleteOrder` on a `zaplatena` order → rejected; on a pre-paid order → soft-deleted
  (`deleted_at` set), slot freed.
- `setStatus(nedostavil_sa)` (manager) → status set, slot freed (re-bookable).

```bash
pnpm test e2e/order-move-delete   # exits 0
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
