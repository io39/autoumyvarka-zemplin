# Spec 14 — Calendar: header, controls & grid

> **Status:** done · **PRD refs:** §5 (two-box calendar, status colors) ·
> **Depends on:** spec 12 (shell), spec 13 (theme / `STATE_COLOR`) ·
> **UI-redesign refs:** `../UI-STRUCTURE.md` §4 (calendar header & layout), §6 (component
> tree) · **Baseline refs:** `../zemplin-baseline.md` (calendar.tsx)

The calendar (`/`): its **controls** — a **shadcn `Calendar` popover date-picker** (month +
year selectors), ◀ ▶ stepping, a **today state**, a **`StatusLegend`**, and a **mobile-only
box filter** — and its **grid rendering**: the time axis, the two-box **Day** grid with
**dynamic-height order cards**, the **Week** overview, and the shared **`BookingCard`**. On
**desktop the calendar has no header** — the sidebar carries the actions and the unpaid
badge (spec 12); the header is **mobile-only**. Clicking a block opens the popup Sheet
(spec 15); Realtime is unchanged.

---

## 1. Requirements

### 1.1 What this feature does

1. Lay out the calendar controls per `UI-STRUCTURE.md` §4, top→bottom: **mobile-only actions
   row** (identity · unpaid badge) → **Deň/Týždeň** switch (centered) → **date** (clickable
   → Calendar popover) flanked by **◀ ▶** → **today state** (`DNES` / `Späť na dnes`) →
   **legenda** (left) + **box filter** (right, mobile only). On desktop there is no actions
   row — the sidebar carries it (item 6).
2. Replace the native `<input type="date">` with a **shadcn `Calendar` popover**
   (`captionLayout="dropdown"`, month + year selectors) as the **only** date control.
3. Add a **`StatusLegend`** above the grid (red/orange/green/gray from `STATE_COLOR`),
   with **shortened labels on mobile**.
4. Keep the **mobile-only box filter**: **Box 1 / Box 2** (as today — no "Obe"). Desktop
   always shows both boxes (no filter).
5. Replace the always-on "Dnes" button with a **today state**: show **`DNES`** when the
   view already covers today; otherwise a **`Späť na dnes`** button.
6. The calendar **header is mobile-only**. On desktop the sidebar (spec 12) carries the
   identity and the manager **unpaid badge**; the calendar shows no header there. **Day
   stays the default view.**
7. **Time axis:** label only at **:00 / :30**, but keep **all** 15-minute grid lines, with
   the hour/half-hour lines at **higher contrast** than the quarter lines. Compress the row
   height (`ROW_PX = 20`) so a full day fits with minimal scrolling.
8. **Order cards** (`BookingCard`) show: time range (From/To, two rows) · vehicle
   **model – services** on one row (model prominent) · a **category** badge · a **note**
   (`Pozn: …`) when present. Text never overflows (truncate / clamp / wrap). Max font 20px.
9. **Dynamic card height (Day view):** a card whose content doesn't fit its time-span grows
   **only its** rows and pushes the grid down, keeping the time axis aligned and other
   slots/boxes intact. (The Step-4 picker — spec 16 — keeps a uniform grid and truncates.)

### 1.2 User stories (from PRD §5, UI-STRUCTURE §4)

- As staff, I open the app to **today, Day view**, see both boxes (desktop) or one box at
  a time (mobile), and a color legend so the status colors are unambiguous.
- As staff, I jump to any date via a **month/year picker** instead of spinning a native
  date field, and step one day/week with ◀ ▶, and snap back with **Späť na dnes**.
- As the manager, I still see the **unpaid badge** and reach `/unpaid` — from the sidebar on
  desktop, from the header on mobile.

### 1.3 Non-goals

- **No Realtime / scheduling-logic changes** — scheduling stays on the 15-minute grid;
  closed-zone shading and the Realtime subscription are unchanged. (The grid *rendering* —
  axis, lines, dynamic-height cards — is in scope; the underlying slot math is not.)
- **No new statuses/colors** — palette comes from spec 13's `STATE_COLOR`.
- No change to box-conflict/duration logic.
- The order **popup Sheet** itself is **spec 15**; this spec only opens it from a block.

---

## 2. Design

### 2.1 Header layout (§4)

`CalendarView` owns the header. The calendar spans the **full window width** — `app/page.tsx`
renders `<CalendarView />` directly with no `max-w-*` wrapper, so the day/week grid uses all
available space inside the shell. The **actions row is `md:hidden`** (mobile-only — on
desktop the sidebar covers it). Top→bottom:

1. **Actions row (mobile only)** — the **identity chip** (`{display_name} • {ROLE_LABEL}`)
   and the manager-only **`UnpaidBadge`** (→ `/unpaid`). (Nová rezervácia is reached from
   the nav — sidebar/bottom-nav — so there's no header button.)
2. **Deň / Týždeň** — centered Tabs (existing toggle, restyled), applies to both views.
3. **Date + ◀ ▶** — large, centered date label; clicking it opens the **Calendar
   popover** (§2.2). ◀ ▶ step one day (Day) / one week (Week). Week shows the week range.
4. **Today state** — below the date: `DNES` if the current view covers today, else a
   **`Späť na dnes`** button (§2.3).
5. **Legenda (left) + Box filter (right)** — one row directly above the grid (§2.4–2.5).

### 2.2 Date picker — shadcn `Calendar` popover

- Add shadcn **`calendar`** + **`popover`** primitives (neither is installed).
- The date label is a `PopoverTrigger`; the popover holds a `Calendar` with
  `captionLayout="dropdown"` (month **and** year dropdowns), `locale` Slovak, week starts
  Monday. Selecting a day pushes `/?view={view}&date={picked}` (same router-push contract
  the component already uses). This **replaces** the native `<input type="date">`.

### 2.3 Today state — pure helper

- Add `lib/calendar/today.ts` (or extend `lib/time/bratislava.ts`):
  `isToday(dateKey, now)` and `viewCoversToday(view, dateKey, now)` — pure, `now` passed in
  (unit-testable). Drives `DNES` vs `Späť na dnes`. `Späť na dnes` reuses the existing
  `gotoToday()` push.

### 2.4 StatusLegend

- New `components/calendar/StatusLegend.tsx` (leaf, presentational). Renders the four
  statuses from `STATE_LABEL` + `STATE_COLOR` (`badge` dot + label). **Mobile:** shortened
  labels (e.g. "Vytv." / "Hot." / "Zapl." / "Nedost.") — shown, not hidden. Left-aligned,
  directly above the grid.

### 2.5 Box filter (mobile only)

- Keep the existing **2-way** mobile box toggle: **Box 1 / Box 2** (`activeBox: 1 | 2`),
  **mobile only** (`sm:hidden`); desktop always renders both columns. Default **Box 1** (as
  today). Restyle to the new theme; no "Obe" option.
  > **Deviation from `UI-STRUCTURE.md` §4** (which draws `Box 1 | Box 2 | Obe`): "Obe" is
  > intentionally omitted — the existing 2-way toggle is sufficient and there is no
  > "show both in one mobile column" layout. Desktop already shows both boxes.
- Day view honors `activeBox`; desktop (`sm:+`) is unaffected (always both).

### 2.6 Identity & unpaid badge (with spec 12)

The whole calendar header is **mobile-only** (`md:hidden`). Identity and the manager unpaid
badge live in **two breakpoint slots**, one visible at a time:

- **Mobile:** the identity chip + `UnpaidBadge` render in the calendar header.
- **Desktop:** the **sidebar** (spec 12) carries the identity (footer) and the
  **`UnpaidBadge` above the SPRÁVA burger** — `AppShell` mints the realtime JWT +
  `getUnpaidCount` for managers and passes them to `Sidebar`.
- `app/page.tsx` stays thin: fetch + render `<CalendarView … />`, passing
  `unpaidCount`/`realtimeJwt`/`staffName`/`role` for the mobile header.

### 2.7 Decomposition (§6 — moderate split, per our per-unit convention)

Extract from the ~550-line `calendar.tsx` (keep behavior identical):

- `CalendarView` — orchestrator: header + Day/Week toggle + Realtime (stays client).
- `CalendarHeader` (mobile-only actions), `DateNav` (Calendar popover + ◀▶ + today state),
  `StatusLegend`, `BoxFilter` (mobile).
- `DayView`, `WeekView`, `TimeAxis`, and the shared **`BookingCard`** (§2.9). The block
  opens the popup Sheet via context (spec 15), falling back to a `/orders/[id]` `Link`.
- Move the date/grid math (`buildRows`, `toMinutes`, `diffMinutes`, `weekDateKeys`, the
  today helpers, `ROW_PX`) into `lib/calendar/` — pure, unit-tested, de-duplicated with the
  copies in `app/page.tsx`.

### 2.9 Grid rendering — axis, cards, dynamic height

- **`lib/calendar/grid.ts`** — `ROW_PX = 20` is the base 15-min row height (the **min** on
  the Day view, a **fixed** height on Week). `TimeAxis` and the Step-4 axis label only
  `:00`/`:30` but render a border on every 15-min row: quarter lines
  `border-muted-foreground/25`, hour/half `…/40`.
- **`components/calendar/BookingCard.tsx`** — presentational `BookingCardContent` with three
  densities: **rich** (Day), **compact** (Week: time + model), **line** (Step-4 occupied
  blocks: time + brand, one row); plus the clickable `BookingCard` wrapper (Sheet via
  `OpenOrderSheetContext`, else `/orders/[id]`), `data-order-id` preserved. Category short
  codes via `CATEGORY_BADGE` (`types/index.ts`). Rich layout: time From/To (two rows, 20px)
  on the left; `model – services` (one 20px row, model semibold) + category badge on the
  right; a 20px `Pozn: …` row when the order has a note. ŠPZ is omitted from the card.
- **`DayView`** is **one CSS grid**: columns = axis + box(es); `gridTemplateRows: auto
  repeat(N, minmax(ROW_PX, auto))`. Time labels + per-box guide cells are per row; bookings
  are grid items spanning `grid-row: start / end`. Because the rows are `auto`-growable, a
  card taller than its span grows **only those** rows — the slot expands across both boxes,
  the axis label moves with it, and slots above/below stay put. Mobile single-box via
  `useMediaQuery` (SSR-safe); `data-box` preserved.
- **`WeekView`** keeps absolute-positioned **compact** cards on a fixed `ROW_PX` grid (14
  box-columns sharing an axis make per-row growth impractical). Each day's two box columns
  are grouped: the start of every new day (header + cell) carries a **left divider + gutter**
  (`ml-1 border-l-2 border-foreground/15 pl-1`) so adjacent days are easy to tell apart on
  the shared axis.

### 2.8 Error handling & states

- Popover/date-picker is client-only UI; no new server paths. `pending` "Načítavam…"
  indicator on navigation is retained.

---

## 3. Tasks

Ordered; complexity S/M/L; deps in parentheses.

1. **(S)** Add shadcn `calendar` + `popover` primitives. (dep: —)
2. **(M)** `lib/calendar/` pure helpers (rows/diff/week keys + `isToday`/`viewCoversToday`)
   with unit tests; de-dupe from `app/page.tsx`/`calendar.tsx`. (dep: —)
3. **(M)** `DateNav` — date label → Calendar popover (month/year dropdowns) + ◀ ▶ +
   `DNES`/`Späť na dnes`. (dep: 1, 2)
4. **(S)** `StatusLegend` (full + shortened-mobile labels) from `STATE_COLOR`/`STATE_LABEL`.
   (dep: spec 13)
5. **(S)** `BoxFilter` (Box 1/Box 2, mobile only) — extract the existing toggle, restyle.
   (dep: —)
6. **(M)** `CalendarHeader` actions (Nová rezervácia, `UnpaidBadge`, mobile identity) +
   prop threading from `app/page.tsx`. (dep: 3, 4, 5)
7. **(M)** Decompose `calendar.tsx` into the §2.7 components. (dep: 6)
8. **(S)** Thin `app/page.tsx` (drop old header; pass `staffName/role/unpaidCount/
   realtimeJwt`). (dep: 6)
9. **(L)** Grid rendering (§2.9): `BookingCard` (rich/compact/line) + `CATEGORY_BADGE`
   replacing `BookingBlock`; CSS-grid dynamic-height `DayView`; compact `WeekView`; axis
   labels `:00`/`:30` + all 15-min lines at higher contrast; `ROW_PX = 20`. (dep: 7)
10. **(S)** Header mobile-only + move `UnpaidBadge` to the sidebar (`AppShell`/`Sidebar`,
    spec 12). (dep: 6)
11. **(M)** Tests: unit (today helpers, row math); e2e (date popover navigates; ◀▶ steps;
    `Späť na dnes` returns to today; mobile box filter Box 1/Box 2; legend present;
    `unpaid-alerts` badge `:visible`). (dep: 7,8,9,10)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # all exit 0
```

### 4.2 Controls (must pass)

```bash
# native date input is gone — expect: 0
grep -rn 'type="date"' components/calendar | wc -l
# Calendar/Popover primitives present — expect: both files exist
test -e components/ui/calendar.tsx && test -e components/ui/popover.tsx && echo OK
# shared card replaces the old BookingBlock — expect: BookingCard present, BookingBlock gone
test -e components/calendar/BookingCard.tsx && ! test -e components/calendar/BookingBlock.tsx && echo OK
```

### 4.3 Behavior (e2e, must pass)

- Default load = **today, Day view**.
- Clicking the date opens a popover with **month + year** dropdowns; picking a date
  navigates (`?date=`), and the grid updates.
- ◀ ▶ step one day (Day) / one week (Week); on a non-today date a **`Späť na dnes`**
  control appears and returns to today; on today it shows **`DNES`**.
- **Mobile** (≤640px): box filter shows **Box 1 / Box 2** (one box at a time); desktop
  shows both with no filter.
- `StatusLegend` renders four entries; mobile uses shortened labels.
- Manager sees the `UnpaidBadge` (→ `/unpaid`) — in the **desktop sidebar** above SPRÁVA and
  in the **mobile** header; prevádzka sees none.
- Time axis labels only `:00`/`:30`; all 15-min lines render. Day cards show
  time · model–services · category · note; a single-slot card with overflowing content grows
  its row without overlapping neighbours.

```bash
pnpm test e2e/calendar-header        # exits 0
```

### 4.4 Manual checks

- [ ] Header matches §4 order at 360px (actions stack) and on desktop (right-aligned).
- [ ] Identity shown exactly once per breakpoint (sidebar on desktop, header on mobile) —
      no duplication.
- [ ] Status block colors + legend agree; no-show treatment intact.
- [ ] Slovak throughout; no horizontal scroll at 360px (Day).
