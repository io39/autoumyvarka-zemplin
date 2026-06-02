# Spec 19 — Calendar & booking refinements

> **Status:** done · **PRD refs:** §5 (calendar), §6 (order detail), §4 (clients/cars),
> §10 (unpaid alerts), §13#1 (shared car) · **Depends on:** specs 12–18 ·
> **UI-redesign refs:** `../UI-STRUCTURE.md` §4 (calendar), §7 (order detail), §8 (wizard)

A round of post-redesign usability refinements on the calendar, the order-detail side
panel, the app shell, and the Nová-rezervácia wizard. **UI-layer only** — no schema or
Server-Action **mutation** changes; the one back-end touch is an additive **read-only**
field on `getClientWithCars` (same pattern as spec 17).

---

## 1. Requirements

### 1.1 Calendar (main + Step-4 picker)

1. Keep 15-minute scheduling. Label the time axis only at **:00 / :30**, but keep **all**
   15-minute grid lines, at **higher contrast** (15-min lines vs. the hour/half-hour lines).
2. **Compress** the grid (smaller base row height) so a full day fits with minimal scroll.
3. **Order cards** show: left = time range (From over To, two rows); right = vehicle
   **model – services** on one row (model prominent), a **category** badge (OS/SUV/…), and a
   **note** row (`Pozn: …`) when present. Max font 20px.
4. Text never overflows the card (truncate / clamp / wrap); model truncates.
5. **Dynamic card height (main Day view only):** a single-slot card whose content doesn't
   fit grows **only its** rows, pushing the grid down and keeping the axis aligned. Other
   slots and both boxes stay aligned at that time. Step-4 keeps a uniform grid (its
   click-to-pick maps Y→time, so rows must stay equal height) and truncates instead.
6. Step-4 **3-day** view does not horizontally scroll on desktop (columns shrink to fit;
   mobile keeps the tap-friendly minimum + scroll). Each box column has a header row showing
   `Box N` + the reservation count (Slovak plural).

### 1.2 Order-detail side panel (desktop)

7. Widen the slide-out Sheet to ~450–600px (responsive), full-height on desktop, never
   full-screen; mobile stays a bottom sheet.
8. More spacing between sections, `p-4` cards, clearer label→value hierarchy, natural
   wrapping of long values. **Section order unchanged** (shared with `/orders/[id]`).

### 1.3 App shell

9. The calendar **header row is mobile-only**; on desktop the sidebar carries everything.
   The manager **overdue-unpaid badge** moves to the **desktop sidebar**, above SPRÁVA.

### 1.4 Booking wizard

10. **Duplicate phone** (Step 1) and **duplicate vehicle** (Step 2): live, **non-blocking**
    warnings naming the existing client, as the manager types. Submit stays enabled
    (`createClient` de-dupes; `addCarToClient` links the shared ŠPZ).
11. **Shared-vehicle badge** ("zdieľané auto", same style as history) on Step-2 car rows.
12. **Doplnkové služby** → collapsible accordion, **collapsed by default**, force-open +
    count badge when any add-on is selected; add-ons grouped under **Tepovanie / Čistenie /
    Ostatné** sub-headers.
13. The stepper shows the selected **client name** under "Klient" and **car brand** under
    "Auto".

### 1.5 Non-goals / decisions baked in

- No order-detail section **reorder** (user-confirmed: leave order alone).
- ŠPZ dropped from the calendar card (user-confirmed); cards omit it.
- Add-on sub-grouping is a **name-prefix heuristic** (`tepovanie…` / `čistenie…` / rest) —
  the catalog has no sub-category column; unknown names fall into "Ostatné".
- Duplicate detection reuses the fuzzy `searchClients`; it's a best-effort **hint**, the
  Server Actions remain the authoritative de-dupe/link on submit.

---

## 2. Design

### 2.1 Grid math & axis — `lib/calendar/grid.ts`, `TimeAxis`

- `ROW_PX = 20` (base/min row height). On the Day view it's the **min** of a growable row;
  on Week / Step-4 it's a fixed row height.
- `TimeAxis` (main) and the Step-4 inline axis label only `:00`/`:30`; every 15-min row has
  a border. 15-min lines `border-muted-foreground/25`, hour/half `…/40`.

### 2.2 Booking card — `components/calendar/BookingCard.tsx` (replaces `BookingBlock`)

- `BookingCardContent` with three densities: **rich** (Day + Step-4), **compact** (Week),
  **line** (Step-4 occupied blocks: time + brand, one row).
- `BookingCard` = the clickable wrapper (Sheet via `OpenOrderSheetContext`, else
  `/orders/[id]` link), `data-order-id` preserved. Positioning is passed in by each surface.
- Category short codes: `CATEGORY_BADGE` in `types/index.ts`.

### 2.3 Day view — `components/calendar/DayView.tsx`

- One CSS grid: columns = axis + box(es); `gridTemplateRows: auto repeat(N, minmax(ROW_PX,
  auto))`. Time labels + per-box guide cells are per-row; bookings are grid items spanning
  `grid-row: start / end`. Auto rows grow to fit a tall card → push-down + axis alignment.
- Mobile single-box via `useMediaQuery` (SSR-safe); `data-box` preserved for e2e.

### 2.4 Week / Step-4

- `WeekView` uses `BookingCard` (compact) + the new line contrast.
- `Step4TimeSlot`: occupied blocks use `BookingCardContent` density **line**; 3-day column
  template shrinks (`minmax(0,1fr)`) on desktop via `useMediaQuery`; a box-header row shows
  `Box N` + count via `skPlural`.

### 2.5 Order-detail panel — `BookingDetailSheet`, `OrderDetailBody`, `sections/*`

- Sheet: `sm:max-h-none sm:max-w-lg xl:max-w-xl` (full height, 512→576px desktop).
- Body `space-y-5`; section cards `p-4`; labels `mb-1 tracking-wide`; `break-words`
  (notes also `whitespace-pre-wrap`). Order of sections unchanged.

### 2.6 App shell — `CalendarHeader`, `AppShell`, `Sidebar`

- `CalendarHeader` root `md:hidden`.
- `AppShell` (manager only) mints the Realtime JWT + `getUnpaidCount`, passes to `Sidebar`;
  `Sidebar` renders `UnpaidBadge` above the SPRÁVA burger. The badge now exists in two
  breakpoint slots (mobile header / desktop sidebar) — one visible at a time.

### 2.7 Wizard — `Step1Client`, `Step2Car`, `Step3Services`, `BookingStepper`, `BookingWizard`

- Step 1/2: debounced (300ms) `searchClients`; exact **normalized** phone match
  (`normalizePhone`) / ŠPZ match on `matchedSpz` (`normalizeSpz`) → amber non-blocking note.
- `getClientWithCars` returns `sharedCarIds` (cars linked to >1 client); threaded through
  `/orders/new` + `/orders/[id]/edit` + `BookingWizard` → `Step2Car` badge.
- `Step3Services`: Doplnkové wrapped in shadcn `Accordion` (collapsed default; `value`
  forced open when `addonSelectedCount > 0`; count badge). Add-ons grouped by `addonGroup`
  (pure helper in `lib/orders/booking.ts`) into Tepovanie/Čistenie/Ostatné, each a reused
  `ServiceGroup`.
- `BookingStepper` accepts optional `subtitles[]`; `BookingWizard` passes client name (step
  1) and car model/ŠPZ (step 2).

---

## 3. Tasks

1. Grid spacing + 30-min labels + line contrast (`grid.ts`, `TimeAxis`, Step-4 axis). ✅
2. Shared `BookingCard` (rich/compact/line) + `CATEGORY_BADGE`; delete `BookingBlock`. ✅
3. `DayView` CSS-grid dynamic height. ✅
4. `WeekView` + `Step4TimeSlot` (line cards, 3-day desktop no-scroll, box-header counts). ✅
5. Order-detail panel width + spacing + wrapping. ✅
6. `CalendarHeader` mobile-only + `UnpaidBadge` in sidebar (`AppShell`/`Sidebar`). ✅
7. Duplicate phone/vehicle warnings (Step 1/2). ✅
8. `sharedCarIds` in `getClientWithCars` + Step-2 badge. ✅
9. Doplnkové accordion + `addonGroup` sub-headers. ✅
10. Stepper subtitles. ✅

---

## 4. Acceptance criteria

- `pnpm typecheck` · `pnpm lint` clean. ✅
- `pnpm test:unit` green incl. `addonGroup` (`tests/unit/orders/booking.test.ts`). ✅
- E2e green on a clean `pnpm supabase db reset`: `calendar-header`, `calendar-sheet`,
  `calendar-week-view`, `navigation`, `unpaid-alerts`, `unpaid-permissions`,
  `booking-wizard`, order suites. ✅
- Manual: a single 15-min booking expands its row on the Day grid; Step-4 3-day fits desktop
  without horizontal scroll; the unpaid badge shows in the desktop sidebar and the mobile
  header (one at a time); duplicate phone/ŠPZ show non-blocking hints; Doplnkové collapsed by
  default and auto-opens with a count.

> **Note:** documented after implementation (the work was done as a live iterative session,
> not spec-first). `data-*` hooks and labels preserved so the existing e2e keep passing;
> `unpaid-alerts` badge locator scoped to `:visible` and `calendar-header` "Nová rezervácia"
> assertion repointed to the sidebar nav.
