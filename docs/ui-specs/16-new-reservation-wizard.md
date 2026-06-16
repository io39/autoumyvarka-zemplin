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
   (styled like a result — label left, the number right) is shown at the **top** of the results list.
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
  Auto). **Responsive layout:** a **2×2 grid on mobile** (`grid grid-cols-2` — Klient/Auto on
  the top row, Služby/Termín on the bottom — so the steps don't overflow a 360px screen, with
  each step's content centred in its cell and the `›` separators hidden), reverting to the
  single horizontal **row on `sm:+`** (`sm:flex`, left-aligned, `›` separators shown).
  `WizardActions` — **Späť** / **Ďalej** (disabled until the step is valid) and, on
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
  and **no** search result has that exact phone, show a **"Nový zákazník" row**
  (`data-new-client`) at the **top** of the results list, styled like a client result (label
  left, the normalized number right). Clicking it opens the **new-client Dialog with the phone
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

- Reuse `ServiceGroup` (per-unit qty, availability dimming). The per-unit (`is_per_unit`,
  "/ks") quantity uses a touch-friendly **`QuantityStepper`** (`components/orders/wizard/`):
  large **− / + buttons** (`size="icon"`, − disabled at the minimum of 1) flanking a digit-only
  field. Native number spinners are hidden on mobile, so the buttons are the primary control.
  The field is `inputMode="numeric"` `pattern="[0-9]*"`, blocks non-digit keys
  (`e`/`E`/`+`/`-`/`.`/`,`) on key-down, and strips non-digits on input — but it **may be
  transiently empty while editing** (so the value is deletable/retypable on a phone) and only
  **settles to ≥ 1 on blur**, so it can never persist as text, empty, negative, or `NaN`. The
  committed value is kept in sync with external changes (the buttons, switching service) via the
  adjust-state-during-render pattern. **Hlavné** renders directly;
  **Doplnkové** is wrapped in a shadcn `Accordion` (**collapsed by default**; `value` forced
  open + an `N vybraté` count badge when `addonSelectedCount > 0`). Inside, add-ons are split
  into **Tepovanie / Čistenie / Ostatné** — each a reused `ServiceGroup` — via the pure
  `addonGroup(name)` helper (`lib/orders/booking.ts`, name-prefix heuristic; unknown →
  Ostatné; unit-tested).
- Running summary: **Σ min** and **Σ €** via `resolveServicePrice`. The optional **manual
  duration override** ("Trvanie (min)", `#override`) is available in **both create and edit**
  and **starts empty** — the duration tracks the **live service sum** (Σ min + step-4 slot
  length). A typed positive value overrides the sum, but **any service change (tick / untick /
  qty) clears the override** and recomputes from the services, so the duration always reflects
  the current selection unless the user re-enters a manual value afterwards. On save the
  effective duration is persisted (`createOrder.durationOverrideMin` on create;
  `moveOrder.durationMin` on edit, when it changed).
- **Manual price override — manager only** (`canPriceOverride`, hidden for `prevadzka` —
  PRD §3). A **"Cena (€, voliteľné)"** field (`#price-override`, `data-price-override`, beside
  the duration override) lets a manager type the order's total in euros (comma or dot decimal,
  `parseEurosToCents`). When a valid amount is entered it **replaces** the Σ-€ running total
  (shown with an "(upravená)" marker); placeholder = the live line sum. Unlike the duration
  override it is **not** cleared by a service change (it's an explicit decision). On save it is
  persisted as cents and becomes the order's total everywhere (order detail, client history,
  unpaid amount): `createOrder.priceOverrideCents` on create; on edit, the diff calls
  `setOrderPrice` only when the value changed (`null` clears it). Prefilled from
  `order.price_override_cents` (formatted euros) in edit mode.
- **Poznámka (voliteľné)** textarea at the bottom (`data-order-note`) → wizard `note` state.

### 2.5 Step 4 — Termín (`Step4TimeSlot`) — the new part

- **Header mirrors §4 (`DateControl`):** Deň / **3 dni** switch; the **shared Calendar
  popover** date control + ◀ ▶; **Dnes / Späť na dnes**; today highlighted (gray) in the day
  blocks. **Layout:** stacked on mobile (switch on top, then a full-width row with the date
  on the left and DNES/Späť na dnes on the right); on desktop a **3-column grid** — switch
  **left**, the date + today-state centred together in the **middle**, the **right column
  empty**. The date label is **view-dependent**, reusing the §14 helpers: **Deň** shows the
  Slovak weekday prefix (`skWeekdayShort` + `formatDMY`, e.g. `Po. 01.06.2026`); **3 dni**
  shows the collapsed 3-day range (`formatWeekRange(date, date+2)`, e.g. `01 – 03.06.2026`,
  widening across month/year boundaries).
- **Quick slots:** call `suggestSlots({ date, durationMin })` → nearest free slots **per
  box** as one-tap buttons; picking one sets `pickedSlot = { box, localStart }`.
- **Full picker (overlapping-reservations redesign):** for each visible day × box, the
  occupied bookings are **lane-placed** (`assignLanes`) with **one extra reserved "free"
  lane** for the new booking — 1 existing → halves, 2 → thirds, 3 → fourths (UI-STRUCTURE
  §8). The reserved lane is the rightmost (a faint dashed `bg-primary/5` strip); the pick
  ghost renders there. **Any open-hours time is clickable — including occupied ones**
  (overlap is allowed, migration 0016): clicking maps Y→time, gated only by the open window
  (`fitsAt` with empty `busy`), so picking over an existing booking is allowed and the wizard
  **confirms the overlap on save** (`OverlapConfirmDialog`). Past slots stay clickable with a
  **MINULOSŤ** tint behind. The green free-zone overlay is **gone** (superseded by the lanes +
  reserved lane); the quick-slots above still suggest the nearest **free** times. The
  **hover-preview ghost is mouse-only** (`useMediaQuery("(hover: hover)")`): touch devices
  don't fire `mouseleave`, so a touch hover would otherwise leave a stray ghost on the
  first-tapped column. Occupied bookings render with the shared `BookingCardContent`
  **line** density (car name). **Variable row heights** (`computeRowLayout`, shared with the
  Day view): a short occupied booking grows its 15-min row(s) — across all columns + the
  shared axis — so it stays readable; the click→time mapping follows the variable rows
  (`slotAtOffset`). **Lane-aware column width:** each box column is
  `minmax(max(lanes × PICKER_MIN_LANE_PX, BOX_MIN_PX), 1fr)` where `lanes` = occupied + the
  reserved free lane, with a `BOX_MIN_PX` floor so the header fits even on an empty (1-lane)
  box; every lane stays a readable width and the grid **scrolls horizontally** when the columns
  don't all fit (same as the Day/Week views). Each box column has a header row showing
  `Box N` + a compact count (`{n} rez.`). The occupied-booking **line** cards show the car name. **Gutter dividers** (a `::before` **rounded bar**,
  `before:w-1.5 before:rounded-lg before:bg-foreground/30`, centred in the `gap-x-2` gutter —
  the same look as the main calendar) mark every inter-column boundary except the axis edge
  (`hasDivider = box === 2 || isDayStart`): one **between Box 1 and Box 2** of each day, and —
  in **3 dni** — one at the **start of each subsequent day**. They're applied to the
  box-header, quick-slot, and grid-column cells (the grid columns are `overflow-hidden`, so
  the divider lives on a wrapper) so the two boxes of one day stay grouped and adjacent days
  are easy to tell apart.
- **Past slots are bookable** (a manager may record a reservation that already happened):
  manual grid clicks are gated only by open hours + overlap (`fitsAt`), not by a past cutoff.
  The **quick slots and the keyboard "nearest free" pick stay anchored to "now"** via
  `lib/orders/slot-grid.ts earliestStartToday`: for **today** the nearest suggested start is the
  **start of the slot containing now** (the slot the clock is in stays bookable; a slot drops
  out of the suggestions only once the clock crosses into the next one — at 11:05 the 11:00
  slot is still suggested, at 13:16 the 13:00 slot is gone and 13:15 is nearest). A day
  **entirely in the past** offers **no quick slots** (`—`), but its free zones remain clickable
  in the grid. `createOrder` carries no past-time guard — only the 15-min boundary, the soft
  box-overlap check (overlaps allowed, confirmable — migration 0016), and the open-hours check
  — so allowing the past is a UI-layer change only.
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

`BookingWizard → BookingStepper, Step1Client, Step2Car, Step3Services (→ ServiceGroup →
QuantityStepper), Step4TimeSlot, WizardActions`. Pure helpers (finish-time, slot/range math)
live in `lib/` (reuse existing;
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
  (the order's client/car don't change here); the wizard **opens on step 3 (Služby)** so the
  manager can adjust services **and the manual "Trvanie" duration** (empty by default — the
  duration tracks the live service sum, §2.4), then **step 4 (Termín)** to pick a new slot.
  Steps 1–2 are visible but locked.
- **Apply on finish** (not `createOrder`): persist the diff against the existing order using
  the **existing actions** — `addOrderService`/`removeOrderService` for the service changes,
  `moveOrder({ id, box, startsAt, durationMin? })` for the new slot **and the duration
  override** (spec 06; `moveOrder` now takes an optional `durationMin` and re-checks
  conflict/hours with the new end), `setNote` when the Poznámka changed (prefilled via
  `EditContext.originalNote` / `initial.note`), and **`setOrderPrice` when the manager price
  override changed** (`EditContext.originalPriceOverrideCents`; `null` clears it — manager
  only). `moveOrder` runs when the slot **or** the duration changed
  (`EditContext.originalDuration`). The conflict check excludes the order's **own** current
  slot so "same time" isn't a false conflict.
- **Final label:** "Uložiť zmeny" (not "Vytvoriť rezerváciu"); on success → **redirect to
  the calendar** at the (possibly new) date (`/?date=…`) + toast, **not** back to the order
  detail — so the updated slot is immediately visible in its schedule context.
- **Reliable post-save redirect.** Submit runs **outside the `useTransition`** (a manual
  `submitting` flag drives the button pending state) and **no `setState` runs after the
  success `router.push`** (a state update right after the push cancels the navigation).
  `submitting` is reset **only on the paths that stay on the page** (failures / create-error);
  on success the wizard navigates and unmounts. Even so, a soft `router.push` can be **dropped**
  by the action's `revalidatePath("/")` re-render — and, on the **overlap-confirm retry**, by
  the closing Radix dialog — leaving the button stuck on "Ukladám…" though the order saved. So
  the success redirect (`goToCalendar`) does `router.push` (keeping the toast + SPA nav) **plus
  a hard-navigation fallback**: a `window.location.assign` that fires only if the push was
  dropped — detected by the component still being **mounted ~600 ms later** (`mountedRef`).
  On a successful push the wizard unmounts and the fallback no-ops. Same for create + edit.
  Step navigation (Step 0→1, Auto add) keeps the transition.
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
- Typing a complete, unregistered number in Step-1 search shows a **Nový zákazník** row
  (`data-new-client`) at the top of the list; clicking it opens the new-client Dialog with
  the phone pre-filled.
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
  client/car (locked) on **Služby**, where the **manual "Trvanie" duration input is present**;
  the manager adjusts services/duration, then on Termín picks a new slot; **"Uložiť zmeny"**
  applies the changes to the **same** order (no new order created; the duration override is
  persisted) and
  **lands on the calendar** at the new date (`/?date=…`) — not back on the order detail.
- Keeping the same time is **not** flagged as a conflict (own slot excluded).
- prevádzka has no Zmeniť čas affordance (manager-only).

### 4.5 Manual checks

- [ ] Each step usable at 360px; stepper shows progress; Späť/Ďalej gating correct.
- [ ] Step-4 header matches §4 (Deň/3 dni, date popover, Dnes/Späť na dnes, today gray).
- [ ] Past times show the MINULOSŤ tint **behind** the free zones but stay **clickable**
      (a past reservation is bookable); box is implicit from the picked slot. The quick slots
      stay anchored to now (the slot the clock is in stays suggested; a day entirely in the
      past offers no quick slots, only grid clicks).
- [ ] On a phone, the /ks quantity can be cleared and retyped (not just appended), only digits
      are accepted, and the − / + buttons step it; no stray gray ghost lingers after picking a
      different slot.
- [ ] As manager, the **Cena (€)** field in step 3 overrides the Σ-€ total ("(upravená)");
      the created/edited order shows that price as **Cena spolu** ("upravená cena") and it
      flows to client history + the unpaid amount. As **prevádzka** the field is absent.
- [ ] Step 4 shows occupied bookings in lanes with a reserved free lane (1 → halves,
      2 → thirds …); clicking an occupied time is allowed and, on **Vytvoriť rezerváciu**,
      the overlap confirm dialog names the clash → confirming creates the overlapping booking.
- [ ] New client + car persist (visible afterwards in `/clients`).
- [ ] Slovak throughout.
