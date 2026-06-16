# Spec 05 — Reservations & two-box calendar

> **Status:** draft · **PRD refs:** §4 (booking flow), §5 (calendar), §6 (states),
> §15#1–3 (acceptance) · **Depends on:** 01 (auth/realtime/audit), 02 (clients/cars),
> 03 (services/durations), 04 (hours/overrides) · **Architecture refs:** §2 (authz),
> §5 (realtime), §6 (scheduler n/a here) · **Data-model refs:** §2.7 `orders`, §2.8
> `order_services`, §3 (RLS)

The heart of the system: the phone-call **booking flow**, the **two-box day/week
calendar** with live updates and the four status colors, the **soft, confirmable
box-overlap check** (overlaps allowed — migration 0016), and automatic **duration
calculation**. Order *detail actions* (status
transitions, notes, assignment, post-hoc service edits) are spec 06; this spec covers
**creating** an order and **viewing** the schedule.

---

## 1. Requirements

### 1.1 What this feature does

1. **Booking flow** (PRD §4), strictly ordered, mobile-first: client → car → services →
   time. Creates an order in state `vytvorena`.
2. **Duration calculation:** order duration = Σ per-(service × car category) line
   durations; shown with the resulting **expected finish time** (`ends_at`); manager may
   override the duration.
3. **Two-box calendar** (PRD §5): Box 1 & Box 2 columns, vertical time axis, blocks
   sized by duration, four status colors, day (default) + week views, **15-minute slot
   grid**. Mobile shows one box at a time with a switcher.
4. **Overlap handling** (migration 0016): overlapping orders in a box are **allowed**;
   the booking flow detects a clash and the operator (**either role**, like create itself)
   confirms it (no hard block).
5. **Live updates** (PRD §5): changes appear in every open calendar without refresh.
6. **Slot validation** against opening hours / overrides (spec 04 helper).
7. Order blocks/detail identify the car by **ŠPZ + model/type**, not the plate alone.
8. Audit order creation (PRD §11).

### 1.2 User stories (PRD §4, §5)

- As **either role**, during a phone call I create a reservation in under a minute
  (PRD §15#1): I type a phone, pick/add the car, tick services, pick a 15-minute slot,
  confirm.
- As **either role**, I see both boxes' schedules for the day at a glance, color-coded,
  and I can tell when each wash should finish.
- As a **worker**, I can read a block and immediately know the car (plate + model) and
  the expected finish time.
- As **either role**, when someone else changes the schedule, mine updates live.

### 1.3 Non-goals

- **Status transitions, notes, assignment, post-hoc service add/remove/pay** — spec 06.
- **SMS** (reminder/ready) — spec 07; this spec only creates orders in `vytvorena`.
- **Client search/management UI** — spec 02 (reused here for the client step).
- **Archive/overview & unpaid alerts** — specs 10/11.

### 1.4 Roles (PRD §3)

Both **manažér** and **prevádzka** may view the calendar and **create** orders. (Moving
time, deleting, marking no-show are manager-only — but those are spec 06.) Creating an
order requires create/find on clients & cars (spec 02), which both roles have.

---

## 2. Design

### 2.1 Routes & UI

| Route | Access | Purpose |
| --- | --- | --- |
| `/` (calendar) | both | two-box day/week calendar; entry point |
| `/orders/new` | both | the booking flow (or a modal over the calendar) |

- **Calendar** (`/`): default **day** view, toggle to **week**. Two columns (Box 1,
  Box 2); vertical axis in **15-minute rows**; closed periods (from spec 04
  `getOpenInterval`) rendered greyed. Each block: color by status, **ŠPZ + model**,
  main service, **start–finish time**. Click → order detail (spec 06).
  - **Date navigation (history lookup):** prev/next arrows, a **"dnes" (today)** button,
    and a **date picker / calendar clicker** plus a typed-date field, so the manager *and*
    workers can jump to **any** day or week — past or future — to review that period's
    orders. Because orders are never purged (soft-delete only, data-model §4), arbitrarily
    old dates load through the same `getCalendar({ view, date })` path; no separate
    archive view is needed. (This replaces the former standalone "orders archive" spec.)
  - **Mobile (<… / ≥360px):** show **one box at a time** with a Box 1/Box 2 switcher
    (PRD §5). Day view is the mobile default.
- **Booking flow**: a stepper (client → car → services → time → confirm). Reuses spec
  02 client lookup + add-car (incl. shared-ŠPZ link prompt) and spec 03 service picker.
  The time step shows a **15-minute slot picker** with **suggested nearest free slots**
  in both boxes, and live shows the computed **duration + finish time**.
- shadcn/ui: calendar built on a grid (the chosen scheduling component — architecture
  §1 TBD, pin on selection), `Dialog`/`Sheet` for the flow, `Select`, `Checkbox`,
  `Badge`. Slovak copy throughout.

### 2.2 Slot model (15-minute granularity)

- Bookable times are on a **15-minute grid** (`:00/:15/:30/:45`). The picker offers
  slots within the day's open interval (spec 04), stepping by 15 min.
- Order `starts_at` must land on a 15-minute boundary (validated server-side). Duration
  is in minutes (service durations are already multiples that fit the grid); `ends_at`
  is generated (`starts_at + duration_min`) — data-model §2.7.
- **Suggested slots:** the booking flow computes the nearest free 15-min start in each
  box that fits `duration_min` within open hours and doesn't overlap an existing order.

### 2.3 Duration & finish time

- On service selection, compute `duration_min = Σ getServicePrice(service, category)
  .duration_min × quantity` (NULL-duration add-ons contribute 0) — spec 03 lookup.
- Display the **finish time** (`starts_at + duration_min`) prominently in the flow and
  on the calendar block (note 2 from planning).
- The manager may **override** `duration_min` (PRD §4); the override is what determines
  `ends_at` and the conflict check. (Whether a worker may override mirrors PRD §3 order-
  data editing = manager-only; workers accept the computed value. Confirmed split from
  spec 02 §1.4.)

### 2.4 Server Actions (`lib/actions/orders.ts`)

All validate with zod; creating writes `audit_log`.

| Action | Input (zod) | Authz | Audit |
| --- | --- | --- | --- |
| `getCalendar` | `{ view: 'day'\|'week', date, box? }` | both | — (read) |
| `suggestSlots` | `{ box?, date, durationMin }` | both | — (read) |
| `createOrder` | `{ clientId, carId, box, startsAt, serviceIds[], quantities?, durationOverrideMin?, priceOverrideCents?, note? }` | both | `order.create` |

- `createOrder` validation: `box ∈ {1,2}`; `startsAt` on a 15-min boundary; ≥1 service;
  each service active and priced for the car's category (else reject — spec 03 lookup);
  the whole `[startsAt, ends_at)` must be **open** (`isRangeOpen`, spec 04); inserts the
  order + snapshotted `order_services` rows (data-model §2.8) in one transaction.
- **Manager-only overrides:** both `durationOverrideMin` and `priceOverrideCents` are
  gated behind `requireManager` (PRD §3 — order-data editing is manager-only); a worker
  passing either is rejected. `priceOverrideCents` (≥ 0, capped at 100 000 €) is stored on
  `orders.price_override_cents` and, when set, **replaces** the summed line price as the
  order total everywhere (order detail, client history, unpaid amount — data-model §2.7).
  It can also be changed later on an existing order via `setOrderPrice` (spec 06).
- **Overlap — warn but allow (migration 0016, `docs/navrh-prekryvajuce-rezervacie.md`).**
  Overlapping reservations in a box are **allowed** (unlimited). `createOrder` calls
  `findBoxOverlaps` and, unless `allowOverlap: true`, returns a soft
  `{ ok:false, conflict, message }` ("Termín v tomto boxe je obsadený") naming the clash;
  the UI confirms and retries with `allowOverlap`. The confirm is available to **either
  role** — it is part of the both-roles create flow, **not** a manager-only override
  (unlike `durationOverrideMin`/`priceOverrideCents` above). There is **no DB constraint**
  any more (data-model §2.7). Opening-hours checks still apply.
  - **TOCTOU note:** the dropped exclusion constraint was the only race-safe guard. Two
    concurrent `createOrder` calls that each pass the soft `findBoxOverlaps` check before
    either inserts will **both** succeed silently — the DB no longer serializes this. For a
    single-operator car wash the practical risk is negligible (and overlaps are allowed by
    design anyway), so this is accepted, not guarded.

### 2.5 Realtime (live calendar)

- Initial calendar load: **server-rendered** via `service_role` (data-model §3.1).
- Live updates: the browser subscribes to `orders` changes for the visible date/box
  range using the **server-minted JWT** (spec 01 / data-model §3.1); deny-by-default
  RLS means the anon key alone reads nothing. New/changed/removed orders update the grid
  in place.
- **Token lifecycle (decoupled from the subscription).** The minted JWT is short-lived
  (1h, data-model §3.1) and the page re-mints it on every render — including the implicit
  re-render a revalidating Server Action (e.g. `setStatus` → `revalidatePath("/")`) causes.
  The subscription must **not** tear down and re-subscribe when only the token changes:
  doing so opened an unsubscribe→resubscribe gap in which the actor's own `postgres_changes`
  echo could be lost (their grid color wouldn't update, while other tabs got it). So token
  changes are pushed onto the live connection with `setAuth` **in place**, and the channel
  re-subscribes **only** when the view/date changes. A periodic re-mint keeps a long-idle
  tab (no nav, no actions) from crossing the 1h TTL. Encapsulated in the shared
  `useRealtimeChannel` hook (`lib/realtime/use-realtime.ts`), used by the calendar and the
  unpaid widgets.

### 2.6 Data & migrations

Migration `0006_orders.sql`:
- `orders` + `order_services` per data-model §2.7–§2.8, incl. the generated `ends_at` and
  indexes (`(box, starts_at)`, `(starts_at)`, `(client_id)`, `(car_id)`, `(status)`). The
  original `0006` `btree_gist` exclusion constraint `orders_no_box_overlap` was **dropped in
  migration 0016** (overlaps are now allowed; collision is a soft app-level check — §2.4).
- Enable RLS; deny-by-default for `anon` writes; **add the authenticated read policy**
  for the calendar (the minted-JWT claim) per data-model §3.1.

### 2.7 Error handling & loading states

- Typed action results `{ ok: false, message }`; conflict and closed-hours rejections
  shown inline in the flow (Slovak).
- Calendar uses a loading skeleton; empty day shows "Žiadne objednávky".
- Optimistic insert on confirm, reconciled by the Realtime echo.

---

## 3. Tasks

1. **(L)** Migration `0006_orders.sql`: tables, generated `ends_at`, indexes, RLS +
   authenticated read policy. (The `0006` `btree_gist` box-overlap exclusion constraint was
   later **dropped in `0016`** — overlaps are now a soft app-level check; see §2.4.)
   (dep: 01–04 migrations)
2. **(M)** `lib/orders/duration.ts`: compute duration from selected services ×
   category (uses spec 03 `getServicePrice`) + unit tests. (dep: spec 03)
3. **(M)** `lib/orders/slots.ts`: 15-min slot generation + `suggestSlots` (open-hours +
   overlap aware, uses spec 04 helper) + unit tests. (dep: spec 04)
4. **(M)** zod schemas + `createOrder` / `getCalendar` / `suggestSlots` actions with
   authz, transaction, conflict-error mapping, audit. (dep: 1, 2, 3)
5. **(L)** Calendar UI: two-box day/week grid, 15-min rows, status colors, greyed closed
   periods, block content (ŠPZ + model, service, start–finish). (dep: 4)
6. **(M)** Realtime subscription wired to the visible range via the minted JWT;
   in-place updates. (dep: 5, spec 01 token helper)
7. **(L)** Booking flow stepper (client → car → services → time), reusing spec 02/03
   UI; live duration + finish time; 15-min slot picker with suggestions. (dep: 4)
8. **(M)** Mobile single-box switcher + responsive layout (≥360px). (dep: 5, 7)
9. **(M)** Tests: unit (duration, slot suggestion, boundary) + e2e (create order; under-
   a-minute happy path; conflict rejected; closed-hours rejected; live update; worker can
   create). (dep: 5–8)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck   # exits 0
pnpm lint        # exits 0
pnpm test        # exits 0
pnpm build       # exits 0
```

### 4.2 Migration, constraint & RLS

```bash
supabase db reset   # applies 0005, exits 0
# Box-overlap exclusion constraint was DROPPED in 0016 — expect 0:
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_constraint where conname='orders_no_box_overlap';"
# RLS enabled on both tables (expect rowsecurity=t):
psql "$LOCAL_DB_URL" -c \
  "select tablename, rowsecurity from pg_tables \
   where tablename in ('orders','order_services') order by 1;"
# Calendar range index present (expect >=1):
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_indexes where tablename='orders' \
   and indexdef ilike '%box%starts_at%';"
```

### 4.3 Overlap — warn but allow (e2e, must pass; migration 0016)

- Create an order Box 1, 09:00–09:45. A second order Box 1, 09:30–10:00 → the action
  returns a soft **`conflict`** (not a hard error); the UI confirms and, on
  `allowOverlap`, the overlapping row **is** inserted.
- The same 09:30 slot in **Box 2** → no conflict (different box).
- A soft-deleted or `nedostavil_sa` order never conflicts (it frees the slot).
- **No DB constraint** backstops this — direct overlapping inserts succeed at the DB.

```bash
pnpm test:e2e booking-wizard   # the pick-occupied → confirm → create flow, exits 0
```

### 4.4 Duration & 15-min slots (unit, must pass)

- Selecting services sums their per-category durations; `ends_at = startsAt +
  durationMin`; a NULL-duration add-on adds 0.
- A manager `durationOverrideMin` changes `ends_at` and the conflict window.
- `createOrder` with a `startsAt` off the 15-min grid (e.g. 09:07) → rejected.
- `suggestSlots` returns only 15-min starts that fit the duration inside open hours and
  don't overlap an existing order.

```bash
pnpm test orders/duration orders/slots   # exits 0
```

### 4.5 Opening-hours validation (e2e, must pass)

- `createOrder` whose `[startsAt, ends_at)` falls outside the day's open interval, or on
  a closed `day_override` date, or spills past `close_time` → rejected (Slovak), no insert.

```bash
pnpm test e2e/order-hours   # exits 0
```

### 4.6 Live update (e2e, must pass)

- Two calendar clients open on the same day; `createOrder` from client A appears in
  client B's grid without a manual refresh.

```bash
pnpm test e2e/calendar-realtime   # exits 0
```

### 4.7 Authorization (e2e, must pass)

- As **prevádzka**: `createOrder` succeeds (workers may create — PRD §3).
- As both roles: `getCalendar` returns the visible orders.

```bash
pnpm test e2e/order-create-permissions   # exits 0
```

### 4.8 Manual checks (map to PRD §15)

- [ ] §15#1: an existing-client reservation completes in **< 1 minute** on a phone.
- [ ] §15#2: both boxes visible simultaneously; all four status colors render correctly.
- [ ] Calendar blocks show **ŠPZ + model** and the **start–finish** time.
- [ ] §15#11: the whole flow works at 360px and on desktop without layout breakage;
      mobile shows one box with a working switcher.
- [ ] All visible strings are Slovak; closed periods render greyed.
- [ ] Date navigation: prev/next, "dnes", and the date picker/typed-date jump the
      day/week view to any chosen date; a far-past date (e.g. 2 years ago) still loads
      that day's orders (no purge).
