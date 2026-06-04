# Spec 16 — Nová rezervácia: 4-step wizard

> **Status:** done · **PRD refs:** §4 (client key), §5 (booking flow, conflicts) ·
> **Depends on:** spec 13 (theme), spec 14 (calendar date controls / slot header),
> spec 15 (the Zmeniť-čas button this repoints — §2.9) ·
> **UI-redesign refs:** `../UI-STRUCTURE.md` §8 (wizard) · **Baseline refs:**
> `../zemplin-baseline.md` (booking-form.tsx ~390)

Restructure the single-page **Nová objednávka** form into a **4-step wizard**
(Klient → Auto → Služby → Termín), available to **all roles**. Reuses the existing
duration/price/slot logic; the **new** parts are the in-flow **client step** (today the
flow redirects to `/clients`) and a richer **Termín** step with quick slots + a visual
picker whose header mirrors the calendar (§4).

> **Folder decision:** keep `components/orders/` (same rationale as spec 15).

---

## 1. Requirements

### 1.1 What this feature does

1. Replace `BookingForm` with a **`BookingWizard`**: `BookingStepper` (4-step progress) +
   per-step components + `WizardActions` (Späť / Ďalej, final **"Vytvoriť rezerváciu"**).
2. **Step 1 Klient** — fuzzy search (telefón/meno, reusing spec-02 unified search) to pick
   an existing client. There is **no separate add-customer button**: when the typed query is
   a **complete phone number that matches no existing client**, a **"Nový zákazník" row**
   (styled like a result — label left, the number right) is appended to the results list.
   Clicking it opens the **new-client dialog with the phone pre-filled** (editable telefón +
   optional meno) → `createClient` → select the new client.
3. **Step 2 Auto** — pick one of the client's cars (a **"zdieľané auto"** badge marks cars
   shared with another client; rows show the combined **značka + model**), or **"+ nové auto"**
   (ŠPZ, **značka** [fuzzy type-to-filter combobox, free text allowed], model, kategória). The
   new-car dialog shows a **non-blocking duplicate-vehicle hint** (the client the ŠPZ is found under).
4. **Step 3 Služby** — **active** services with a running **Σ min + €**: **Hlavné** always
   shown; **Doplnkové** in a **collapsible accordion** (collapsed by default; auto-open +
   count when any add-on is selected) grouped under **Tepovanie / Čistenie / Ostatné**
   sub-headers. Also an optional **Poznámka** to attach a note to the order.
5. **Step 4 Termín** — **Deň / 3 dni** switch, the **Calendar popover** date control
   (shared with §4) + ◀ ▶ + **Dnes / Späť na dnes**, **quick slots per box** (one-tap), and
   a **full slot picker** with a **MINULOSŤ** past-time overlay; **box is implicit** (set by
   the picked slot); enforce **no box+time overlap** (rule #2). Occupied bookings render as
   one-line cards; the **3-dni** grid fits the desktop width (no horizontal scroll) and each
   box column shows its reservation count.
6. **Entry points:** nav "Nová rezervácia" and the calendar **+** → blank wizard at step 1;
   from a **client detail** page → client prefilled, **skip to step 2**.
7. On success: toast + return to the calendar on the chosen date with the new order visible.
8. The **stepper** shows the selected **client name** under Klient and **car brand** under
   Auto.

### 1.2 User stories (UI-STRUCTURE §8)

- As staff, I create a reservation by stepping Klient → Auto → Služby → Termín, picking a
  free slot visually instead of typing a time and guessing.
- As staff, if the caller is new I add them (and their car) inline without leaving the flow.
- As staff opening the wizard from a client's page, I start already on Auto.

### 1.3 Non-goals

- **No change to the create/availability Server Actions** — `createOrder` (which already
  accepts an optional `note`), `suggestSlots`, `resolveServicePrice`, `bratislavaLocalToISO`,
  and the box-overlap constraint are reused unchanged (specs 03/05). `getClientWithCars`
  gains a **read-only** `sharedCarIds` field (additive, like spec 17).
- **Duplicate hints are advisory, not enforcement** — the phone/vehicle warnings are
  non-blocking; `createClient`/`addCarToClient` remain the authoritative de-dupe/link on
  submit (telefón = key, shared-ŠPZ link — spec 02). No hard block on duplicates.
- **Edit mode is in scope** (§2.9): this spec wires **Zmeniť čas** to reuse the wizard
  (prefilled, services + slot editable) and repoints spec 15's button. It does **not**
  allow changing the order's client/car (those stay locked in edit mode).

> **Persistence note:** the prototype marked new client/car as "not persisted (Phase 2)".
> **Not applicable to Zemplín** — `createClient` / `addCar` (spec 02) persist immediately,
> so steps 1–2 create real rows via the existing actions.

---

## 2. Design

### 2.1 Wizard shell

- `BookingWizard` (client) holds wizard state: `{ clientId, carId, selections[],
  durationOverride?, view: 'day'|'3day', date, pickedSlot }` and the current step.
- `BookingStepper` — 4 labelled steps (Klient · Auto · Služby · Termín), current/done
  states, with an optional **subtitle** per step (client name under Klient, car brand under
  Auto). `WizardActions` — **Späť** / **Ďalej** (disabled until the step is valid) and, on
  step 4, **"Vytvoriť rezerváciu"**.
- Wizard state also carries `note` (the order note, shared by create + edit).
- **Client warning flags:** once a client is selected (or prefilled/edit), the wizard fetches
  `getClientFlags` and shows a `<ClientFlagBadges>` banner above the steps (overdue unpaid /
  no-shows — spec 10). Nothing renders for a clean client.
- Step validity gates: 1 needs a `clientId`; 2 a `carId`; 3 ≥1 service; 4 a `pickedSlot`.
- **Width:** the wizard pages (`/orders/new`, `/orders/[id]/edit`) have **no page-level
  `max-w-*`**; inside `BookingWizard` the header, stepper, the form-based steps (1–3) and
  `WizardActions` are **centered** at a readable width (`mx-auto max-w-4xl`), while **Step 4
  (Termín) spans the full window width** so the slot grid has room
  — `step === 3 ? "w-full" : "mx-auto max-w-4xl"`.

### 2.2 Step 1 — Klient (`Step1Client`)

- Reuse the **spec-02 unified search** action (phone/name) in an autocomplete; selecting a
  result sets `clientId` and loads the client's cars.
- **New-client via a result row** (no standalone button): the search field doubles as the
  phone entry. When the typed query (debounced) `normalizePhone`s to a complete E.164 number
  and **no** search result has that exact phone, append a **"Nový zákazník" row**
  (`data-new-client`) to the results list, styled like a client result (label left, the
  normalized number right). Clicking it opens the **new-client Dialog with the phone
  pre-filled** (the Dialog is mounted only while open and keyed on the phone, so its fields
  start fresh): editable **telefón** + optional **meno** + **Pridať** → `createClient` →
  select the new client (auto-advances to step 2). Telefón is the key (rule #1). The Dialog
  keeps its non-blocking duplicate-phone hint (`data-dup-phone`) in case the phone is edited;
  if a record raced in (phone is `UNIQUE`), `createClient` returns the existing id and that
  client is selected instead. The row hides as soon as a result matches the number (pick the
  existing client) or the query isn't yet a full number.
- Replaces today's `/clients?return=/orders/new` redirect — the page no longer bounces.

### 2.3 Step 2 — Auto (`Step2Car`)

- List the client's cars (ŠPZ — model (kategória)); pick one → `carId`. A **"zdieľané
  auto"** `Badge` (same style as the history view) marks cars in `sharedCarIds` — cars linked
  to >1 client. `getClientWithCars` returns `sharedCarIds` (one extra read-only query),
  threaded through `/orders/new` + `/orders/[id]/edit` + `BookingWizard`. The car's
  `pricing_category` drives step-3 pricing (as today).
- **"+ nové auto"** Dialog (ŠPZ, model, kategória) → `addCarToClient` (spec 02) → select. As
  the ŠPZ is typed, an exact normalized-ŠPZ match (on `searchClients`' `matchedSpz`) shows a
  **non-blocking** hint naming the client the vehicle is found under (`data-dup-vehicle`);
  submit stays enabled (the action links the shared ŠPZ).

### 2.4 Step 3 — Služby (`Step3Services`)

- Reuse `ServiceGroup` (per-unit qty, availability dimming). **Hlavné** renders directly;
  **Doplnkové** is wrapped in a shadcn `Accordion` (**collapsed by default**; `value` forced
  open + an `N vybraté` count badge when `addonSelectedCount > 0`). Inside, add-ons are split
  into **Tepovanie / Čistenie / Ostatné** — each a reused `ServiceGroup` — via the pure
  `addonGroup(name)` helper (`lib/orders/booking.ts`, name-prefix heuristic; unknown →
  Ostatné; unit-tested).
- Running summary: **Σ min** and **Σ €** via `resolveServicePrice`. Keep the optional
  **manual duration override** (create-only). The effective duration sets the step-4 slot
  length.
- **Poznámka (voliteľné)** textarea at the bottom (`data-order-note`) → wizard `note` state.

### 2.5 Step 4 — Termín (`Step4TimeSlot`) — the new part

- **Header mirrors §4:** Deň / **3 dni** switch; the **shared Calendar popover** date
  control + ◀ ▶; **Dnes / Späť na dnes**; today highlighted (gray) in the day blocks.
- **Quick slots:** call `suggestSlots({ date, durationMin })` → nearest free slots **per
  box** as one-tap buttons; picking one sets `pickedSlot = { box, localStart }`.
- **Full picker:** for each visible day × box, render free ranges computed from existing
  orders + the open interval (reuse `lib/orders/slots.ts` + `getOpenInterval`) as an
  **unlabeled dashed-green overlay** (no "Voľné" text), with a **MINULOSŤ** overlay over past
  times. Tapping a free range sets `pickedSlot` (box
  implicit). Enforce no overlap with the chosen duration (the DB constraint is the backstop;
  the picker pre-filters). Occupied bookings render with the shared `BookingCardContent`
  **line** density (time + brand, **centered** — like the chosen-slot box). The grid uses a **fixed** `ROW_PX` (its click maps Y→time,
  so rows stay uniform — unlike the Day view's dynamic rows). The **3-dni** column template
  shrinks to `minmax(0,1fr)` on desktop (`useMediaQuery`) so it fits without horizontal
  scroll; each box column has a header row showing `Box N` + the reservation count. The
  occupied-booking **line** cards use a slightly larger **13px** font (`text-[13px]`) for
  legibility in the wider grid. In **3 dni**, the first box column of each subsequent day
  carries a **divider centered in the gutter** (a `::before` placed half a `gap-x` into the
  gap, on the box-header, quick-slot, and grid-column cells — the grid columns are
  `overflow-hidden`, so the divider lives on a wrapper) so the two boxes of one day stay
  grouped and adjacent days are easy to tell apart.
- **Past cutoff (`lib/orders/slot-grid.ts earliestStartToday`):** for **today**, the earliest
  selectable start is the **start of the slot containing now** — the slot the clock is in
  stays bookable, and a slot closes only once the clock crosses into the next one (at 11:05
  the 11:00 slot is still pickable; at 13:16 the 13:00 slot is closed and 13:15 is the
  earliest). A day **entirely in the past** is fully blocked: no free zones, no quick slots,
  the MINULOSŤ overlay covers the whole open range, and clicks/keyboard picks are rejected.
- The **selected slot** ghost shows the **start–end** range (`HH:MM–HH:MM`), not just the
  start.
- **Submit:** `bratislavaLocalToISO(date, pickedSlot.localStart)` → `createOrder({ clientId,
  carId, box, startsAt, services, durationOverrideMin?, note? })` → toast → `/?date={date}`.

### 2.6 Page & entry points

- `app/orders/new/page.tsx`: load active `services`; if `clientId` present, prefetch the
  client + cars and start the wizard at **step 2**; otherwise blank at **step 1** (drop the
  `/clients` redirect). The calendar **+** links here with no params (blank).
- The client-detail "Nová rezervácia" button (spec 17) links with `?clientId=` → step 2.

### 2.7 Decomposition (§6)

`BookingWizard → BookingStepper, Step1Client, Step2Car, Step3Services, Step4TimeSlot,
WizardActions`. Pure helpers (finish-time, slot/range math) live in `lib/` (reuse existing;
add range-building if not already there). `Step4` shares the date-popover + today helpers
from spec 14 (`lib/calendar/`).

### 2.8 Error handling & states

- Per-step inline validation (Slovak); `Ďalej` disabled until valid.
- `suggestSlots` empty → "V tento deň nie sú voľné termíny."; create conflict → the
  action's Slovak error surfaces as a toast, user stays on step 4.
- New client/car action failures → inline dialog error, no step advance.

### 2.9 Edit mode — "Zmeniť čas" reuses the wizard (replaces spec-15's dialog)

The order-detail **Zmeniť čas** button (spec 15, manager-only) opens this wizard in an
**edit mode** instead of the interim `ChangeTimeDialog`. Behavior:

- **Entry:** `app/orders/[id]/edit/page.tsx` (manager-gated) — or `/orders/new?editOrderId=`
  — loads the existing order (client, car, services, current box/slot) and mounts
  `BookingWizard` with `mode: 'edit'` + the prefilled state.
- **Prefill + start step:** client (step 1) and car (step 2) are prefilled and **locked**
  (the order's client/car don't change here); the wizard **opens on step 3 (Služby)** so
  the manager can **add/remove services**, then **step 4 (Termín)** to pick a new slot via
  the same quick-slots + interactive picker. Steps 1–2 are visible/back-navigable but not
  the point.
- **Apply on finish** (not `createOrder`): persist the diff against the existing order using
  the **existing actions** — `addOrderService`/`removeOrderService` for the service changes,
  `moveOrder({ id, box, startsAt })` for the new slot (spec 06), and `setNote` when the
  Poznámka changed (the field is prefilled from the order's note via `EditContext.originalNote`
  / `initial.note`). The conflict check must exclude the order's **own** current slot so
  "same time" isn't a false conflict.
- **Final label:** "Uložiť zmeny" (not "Vytvoriť rezerváciu"); on success → **redirect to
  the calendar** at the (possibly new) date (`/?date=…`) + toast, **not** back to the order
  detail — so the updated slot is immediately visible in its schedule context.
- **Repoint spec 15:** replace `ChangeTimeDialog` wiring with a link/navigation to this
  edit entry. (This is why spec 16 depends on spec 15.)

> Scope note: edit mode reuses Step3/Step4 UI; the only genuinely new pieces are the edit
> entry route, the locked-prefill, and the apply-diff-on-finish path.

---

## 3. Tasks

1. **(M)** `BookingWizard` shell + `BookingStepper` + `WizardActions` + step state/validity.
2. **(M)** `Step1Client` — reuse spec-02 search; "Pridať zákazníka" dialog → `createClient`.
3. **(S)** `Step2Car` — car list + "+ nové auto" dialog → `addCar`.
4. **(S)** `Step3Services` — wrap existing `ServiceGroup` + Σ summary + override. (dep: —)
5. **(L)** `Step4TimeSlot` — Deň/3-dni header (shared §14 controls), quick slots
   (`suggestSlots`), full picker with free-range computation + MINULOSŤ overlay. (dep: 4)
6. **(M)** Page rewrite: drop the `/clients` redirect; prefill→step 2 when `clientId`.
7. **(L)** **Edit mode** (§2.9): edit entry route loading an existing order; `mode:'edit'`
   wizard (locked client/car, open on step 3); apply-diff on finish (service add/remove +
   `moveOrder`, self-slot excluded from conflict); **repoint spec-15 Zmeniť čas** to it.
   (dep: 5, spec 15)
8. **(M)** Refinements: Step-1 new-client row (→ pre-filled dialog) on unregistered number + Step-2 dup-vehicle hints (debounced
   `searchClients`); `getClientWithCars.sharedCarIds` + Step-2 **zdieľané auto** badge;
   Step-3 **Doplnkové accordion** + `addonGroup` sub-headers + **Poznámka** field (→
   `createOrder.note` / edit `setNote`); `BookingStepper` subtitles; Step-4 line cards +
   3-dni desktop no-scroll + box-header counts. (dep: 5, 7)
9. **(M)** Tests: e2e (blank flow creates an order end-to-end; client-prefill starts at
   step 2; quick slot + full picker pick; conflict rejected; per-unit qty; **edit mode**:
   Zmeniť čas opens prefilled at step 3, change a service + move the slot, saves) + unit
   (range/finish math, `addonGroup`). (dep: 5, 6, 7, 8)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # all exit 0
```

### 4.2 Flow (e2e, must pass)

- From nav/calendar **+**: wizard opens at **step 1** (Klient); search selects an existing
  client; **Pridať zákazníka** creates+selects a new one.
- Step 2 picks/creates a car (shared cars show the **zdieľané auto** badge); step 3 selects
  services — **Doplnkové** collapsed by default, auto-opening with a count when an add-on is
  picked, sub-grouped Tepovanie/Čistenie/Ostatné — shows Σ min + Σ €, and an optional
  **Poznámka**; step 4 picks a free slot and **"Vytvoriť rezerváciu"** creates the order
  (with the note) and lands on the calendar for that date.
- From a client page (`?clientId=`): wizard starts at **step 2** (client prefilled).
- Picking a slot that overlaps an existing order in that box is rejected (Slovak error).
- Typing a complete, unregistered number in Step-1 search appends a **Nový zákazník** row
  (`data-new-client`); clicking it opens the new-client Dialog with the phone pre-filled.
  The new-car Dialog still shows its non-blocking duplicate-vehicle hint (`data-dup-vehicle`)
  but allows submit.
- The stepper shows the client name (Klient) and car brand (Auto).

```bash
pnpm test e2e/booking-wizard         # exits 0
```

### 4.3 No redirect bounce (must pass)

```bash
# the old "send to /clients to choose" redirect is gone — expect: 0
grep -rn "return=/orders/new\|redirect(\"/clients" app/orders/new | wc -l
```

### 4.4 Edit mode — Zmeniť čas (e2e, must pass)

- From an order's **Zmeniť čas** (manager): the wizard opens **prefilled** with that order's
  client/car (locked) on **step 3**; the manager adds/removes a service and picks a new slot;
  **"Uložiť zmeny"** applies the changes to the **same** order (no new order created) and
  **lands on the calendar** at the new date (`/?date=…`) — not back on the order detail.
- Keeping the same time is **not** flagged as a conflict (own slot excluded).
- prevádzka has no Zmeniť čas affordance (manager-only).

### 4.5 Manual checks

- [ ] Each step usable at 360px; stepper shows progress; Späť/Ďalej gating correct.
- [ ] Step-4 header matches §4 (Deň/3 dni, date popover, Dnes/Späť na dnes, today gray).
- [ ] Past times show the MINULOSŤ overlay; box is implicit from the picked slot. The
      slot the clock is currently in stays selectable (closes only once the clock crosses
      into the next slot), and a day entirely in the past is fully blocked.
- [ ] New client + car persist (visible afterwards in `/clients`).
- [ ] Slovak throughout.
