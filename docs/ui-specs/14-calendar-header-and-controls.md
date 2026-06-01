# Spec 14 — Calendar header, date-picker & box filter

> **Status:** draft · **PRD refs:** §5 (two-box calendar, status colors) ·
> **Depends on:** spec 12 (shell), spec 13 (theme / `STATE_COLOR`) ·
> **UI-redesign refs:** `../UI-STRUCTURE.md` §4 (calendar header & layout), §6 (component
> tree) · **Baseline refs:** `../zemplin-baseline.md` (calendar.tsx)

Rebuild the **calendar header** (`/`) to the §4 layout, add the two genuinely new
controls — a **shadcn `Calendar` popover date-picker** (month + year selectors) replacing
the native date input, and a **mobile-only box filter** (Box 1 / Box 2) — plus a
**`StatusLegend`**, and reconcile the page header that spec 12 left half-removed. Grid
rendering, Realtime, and block→`/orders/[id]` navigation are **unchanged** here (the
calendar popup Sheet is spec 15).

---

## 1. Requirements

### 1.1 What this feature does

1. Lay out the calendar header per `UI-STRUCTURE.md` §4, top→bottom: **actions**
   (Nová rezervácia · unpaid badge · identity) → **Deň/Týždeň** switch (centered) →
   **date** (clickable → Calendar popover) flanked by **◀ ▶** → **today state**
   (`DNES` / `Späť na dnes`) → **legenda** (left) + **box filter** (right, mobile only).
2. Replace the native `<input type="date">` with a **shadcn `Calendar` popover**
   (`captionLayout="dropdown"`, month + year selectors) as the **only** date control.
3. Add a **`StatusLegend`** above the grid (red/orange/green/gray from `STATE_COLOR`),
   with **shortened labels on mobile**.
4. Keep the **mobile-only box filter**: **Box 1 / Box 2** (as today — no "Obe"). Desktop
   always shows both boxes (no filter).
5. Replace the always-on "Dnes" button with a **today state**: show **`DNES`** when the
   view already covers today; otherwise a **`Späť na dnes`** button.
6. Reconcile the **page-header leftovers** from spec 12 (staff identity, unpaid badge) into
   the new header; **Day stays the default view** (already the case).

### 1.2 User stories (from PRD §5, UI-STRUCTURE §4)

- As staff, I open the app to **today, Day view**, see both boxes (desktop) or one box at
  a time (mobile), and a color legend so the status colors are unambiguous.
- As staff, I jump to any date via a **month/year picker** instead of spinning a native
  date field, and step one day/week with ◀ ▶, and snap back with **Späť na dnes**.
- As the manager, I still see the **unpaid badge** and reach `/unpaid` from the header.

### 1.3 Non-goals

- **No grid/Realtime changes** — the Day/Week grids, the 15-min rows, closed-zone
  shading, and the Realtime subscription are unchanged; only the header + legend + box
  filter change.
- **No order popup** — clicking a block still navigates to `/orders/[id]` (a `Link`).
  The calendar **popup Sheet** is **spec 15**.
- **No new statuses/colors** — palette comes from spec 13's `STATE_COLOR`.
- No change to box-conflict/duration logic.

---

## 2. Design

### 2.1 Header layout (§4)

`CalendarView` (the current `Calendar`) owns the header. Top→bottom:

1. **Actions row** — right-aligned: `Nová rezervácia` button (→ `/orders/new`, blank),
   the manager-only **`UnpaidBadge`** (→ `/unpaid`), and the **identity chip**
   (`{display_name} • {ROLE_LABEL}`). On mobile the actions stack per §4
   (identity left / unpaid right, then a full-width Nová rezervácia).
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

### 2.6 Header reconciliation with spec 12 (identity & unpaid)

Spec 12 removed the page's `<main>` and the `/menu` link, and put the **identity in the
sidebar footer (desktop)**. To avoid showing identity twice on desktop:

- **Identity chip** (`display_name • role`) renders in the **calendar header on mobile
  only** (`md:hidden`) — desktop relies on the sidebar footer. *Confirm in review.*
- **`UnpaidBadge`** moves into the calendar header actions (both breakpoints), manager-only
  — `app/page.tsx` already computes `unpaidCount` and mints the realtime JWT; pass
  `unpaidCount`, `realtimeJwt`, `staffName`, `role` into `CalendarView` as props (it no
  longer renders the old page header).
- `app/page.tsx` becomes thin: fetch + render `<CalendarView … />`, no header markup.

### 2.7 Decomposition (§6 — moderate split, per our per-unit convention)

Extract from the ~550-line `calendar.tsx` (keep behavior identical):

- `CalendarView` — orchestrator: header + Day/Week toggle + Realtime (stays client).
- `CalendarHeader` (actions), `DateNav` (Calendar popover + ◀▶ + today state),
  `StatusLegend`, `BoxFilter` (mobile).
- `DayView` (current `DayGrid`), `WeekView` (`WeekGrid`), `TimeAxis`, `BoxColumn`,
  `BookingBlock` (current `Block`). Block stays a `Link` to `/orders/[id]` (spec 15 swaps
  it for the Sheet trigger).
- Move the date/grid math (`buildRows`, `toMinutes`, `diffMinutes`, `weekDateKeys`, the
  today helpers) into `lib/calendar/` — pure, unit-tested, de-duplicated with the copies
  in `app/page.tsx`.

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
7. **(M)** Decompose `calendar.tsx` into the §2.7 components; behavior unchanged. (dep: 6)
8. **(S)** Thin `app/page.tsx` (drop old header; pass `staffName/role/unpaidCount/
   realtimeJwt`). (dep: 6)
9. **(M)** Tests: unit (today helpers, row math); e2e (date popover navigates; ◀▶ steps;
   `Späť na dnes` returns to today; mobile box filter Box 1/Box 2; legend present). (dep: 7,8)

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
- Manager sees the `UnpaidBadge` (→ `/unpaid`); prevádzka does not.

```bash
pnpm test e2e/calendar-header        # exits 0
```

### 4.4 Manual checks

- [ ] Header matches §4 order at 360px (actions stack) and on desktop (right-aligned).
- [ ] Identity shown exactly once per breakpoint (sidebar on desktop, header on mobile) —
      no duplication.
- [ ] Status block colors + legend agree; no-show treatment intact.
- [ ] Slovak throughout; no horizontal scroll at 360px (Day).
