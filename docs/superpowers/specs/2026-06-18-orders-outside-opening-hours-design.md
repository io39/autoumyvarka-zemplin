# Design — Orders outside opening hours

**Date:** 2026-06-18 · **Status:** approved (brainstorm), pending implementation plan
**Touches specs:** 04 (opening hours), 10 (manager alerts). Fold the behaviour into
those on completion — no new spec file (single-source-of-truth rule).

## 1. Problem

Orders can only be created **within** opening hours — `createOrder` /
`moveOrder` enforce `isRangeOpen`. So an order is never *born* outside hours.
The one way an order ends up outside hours is when a **manager narrows or closes
hours after the order already exists**: editing the weekly `opening_hours`, adding
a closed/narrower `day_override`, or removing an override that had opened a day.

Today nothing flags this, and such an order renders **misleadingly** on the
calendar — a 06:00–07:00 booking on an 08:00-open day is clamped to a 1-slot
sliver at the 08:00 row (it used to crash with a `NaN` height; that's already
fixed by clamping, commit `335cb75`).

Goal: (a) **warn** the manager at the moment a hours change would orphan existing
orders, letting them proceed if they really mean to; and (b) keep a **persistent,
discoverable worklist** of currently-orphaned orders so none are forgotten.

## 2. Key principle — derived, never stored

"Outside hours" is a pure function of *(an order's time)* vs *(its day's current
open interval)*. It is **computed on read**, never persisted. Consequences:

- **No migration, no new column, no flag to keep in sync.**
- An order **auto-drops** from every warning the moment it's resolved —
  rescheduled back into hours, cancelled, or the hours re-widened.

This mirrors the existing **unpaid-alerts** feature (`lib/orders/unpaid.ts`,
`/unpaid`, the sidebar `UnpaidBadge`), which is also a derived manager worklist.

## 3. Scope — which orders count

An order is "outside hours" when **all** hold:

- `deleted_at IS NULL`
- `status = 'vytvorena'` (not `hotova` / `zaplatena` / `nedostavil_sa` — those are
  done/terminal and not actionable as a future scheduling problem)
- `starts_at >= start of today` (Bratislava local) — a past wash that already
  happened is never flagged; narrowing last week's hours must not create busywork
- its `[starts_at, ends_at)` does **not** fit the day's open interval
  (`isRangeOpen(starts_at, ends_at, hours, overrides)` is false)

## 4. Detection helper (pure, unit-tested)

New `lib/orders/out-of-hours.ts`, mirroring `lib/orders/unpaid.ts`:

```ts
interface OutsideHoursInput {
  starts_at: string;
  ends_at: string;
  status: OrderStatus;
  deleted_at: string | null;
}
// True when this order is upcoming, vytvorená, and its window doesn't fit
// `interval` (the day's open interval; null = closed → always outside).
function isOutsideHours(o: OutsideHoursInput, interval: OpenInterval | null, todayKey: string): boolean
```

Reused by **both** the at-save check (against the *proposed* hours config) and the
persistent list (against the *current* saved config) — the only difference is which
`hours`/`overrides` arrays feed `getOpenInterval`.

## 5. Warn-but-allow at the hours change

Mirrors the box-overlap `allowOverlap` mechanism (`OverlapConfirmDialog` + a soft
conflict on `ActionResult`).

**Actions** (`lib/actions/settings.ts`): `saveOpeningHours`, `upsertDayOverride`,
`removeDayOverride` each gain:

1. An `allowOutsideHours?: boolean` field on their zod schema.
2. Before writing: load upcoming `vytvorena` orders (today onward) **affected by
   this change** and recompute each against the **proposed** config:
   - `saveOpeningHours` (whole week) → all upcoming orders, vs the new weekly hours
     (+ existing overrides).
   - `upsertDayOverride` → orders on that one date, vs the override.
   - `removeDayOverride` → orders on that date, vs the reverted weekly hours.
3. If any would be orphaned **and** `allowOutsideHours` is not true → return
   `{ ok: false, message, outsideHoursWarning: { count, sample } }` **without
   saving**. `sample` = a few orders (car label + date·time) for the dialog.
4. With `allowOutsideHours: true` → save normally.

**Result shape:** add an optional `outsideHoursWarning?` field to the failure side
of `ActionResult` (parallel to `conflict?`), so the settings editors can branch on
it. (It is settings-only; the orders actions keep using `conflict`.)

**UI** (`components/settings/opening-hours-editor.tsx` +
`day-overrides-editor.tsx`): on an `outsideHoursWarning` result, open a confirm
dialog — *"Táto zmena ponechá {N} {objednávka/objednávky/objednávok} mimo
otváracích hodín. Napriek tomu uložiť?"* listing the sample — and on confirm,
re-call the action with `allowOutsideHours: true`. New shared
`OutsideHoursConfirmDialog` component (modelled on `OverlapConfirmDialog`).
Slovak count agreement via the existing `skPlural` helper (`lib/intl/sk.ts`).

## 6. Persistent surface — `/mimo-hodin` page + sidebar badge

Mirrors `/unpaid` + `UnpaidBadge` exactly (manager-only, realtime, derived).

**Actions** (`lib/actions/orders.ts`):
- `getOutsideHoursOrders()` — `requireManager`; loads upcoming `vytvorena` orders
  (+ client/car), resolves each day's current interval, filters via
  `isOutsideHours`; returns each with the order's **true** date·time and the day's
  **current** hours (so the mismatch is legible), sorted soonest-first.
- `getOutsideHoursCount()` — lightweight count for the badge (`requireManager`,
  throws for workers).

**Page** `app/mimo-hodin/page.tsx` (manager-only 403 flow, mints `realtimeJwt`):
- `components/outside-hours/outside-hours-list.tsx` — desktop table + mobile
  stacked cards (the spec-09/10 responsive pattern), `data-section="outside-hours"`.
  Columns: car (ŠPZ/label), **objednávka** (true date·time), **otváracie hodiny**
  (the day's current interval, or "zatvorené"), status badge, → link to
  `/orders/[id]`. Slovak empty state "Žiadne objednávky mimo otváracích hodín."
- Live: refetch on `orders` + `day_overrides` + `opening_hours` realtime changes
  (so rescheduling/cancelling, or re-widening hours, drops rows without reload).

**Badge** `components/outside-hours/outside-hours-badge.tsx` — in the desktop
`Sidebar` next to `UnpaidBadge` (manager-only, hidden at 0, links to `/mimo-hodin`,
live). `AppShell` mints the count for managers and passes it to `SidebarShell` →
`Sidebar`. Label e.g. "Mimo hodín: {n}".

**Resolve:** no new controls — the manager opens the order and uses the existing
**Zmeniť čas** (reschedule into open hours) or **Zrušiť objednávku** (cancel). The
row drops live (derived). No inline quick-actions on the list (YAGNI).

## 7. Calendar rendering of an orphaned order

Keep the current **clamp** (no crash) but make it **honest**: mark such a card
visually so a 06:00→07:00 order isn't silently shown as 08:00→08:15.

- `DayView` / `WeekView` already know each day's `interval`; compute an
  `outsideHours` boolean per placed card (its window vs the day interval) and pass
  it to `BookingCard`.
- `BookingCard` renders a small warning treatment when set — a dashed/`ring`
  outline + a "mimo hodín" tag and a `title` tooltip showing the true time. No
  layout change beyond the marker.

## 8. Out of scope (YAGNI)

- No stored "outside hours" flag / no migration.
- No auto-reschedule or bulk-fix. The manager resolves each order by hand.
- No new audit codes — the hours change already audits
  (`settings.hours_update` / override), and reschedule/cancel audit as usual.
- No worker access — manager-only, like unpaid alerts (PRD §3).
- Extending the day grid to render the order at its true position (the "union"
  trick) is **not** done — the marker is enough; revisit only if the clamp proves
  confusing in practice.

## 9. Tests

- **Unit** `tests/unit/orders/out-of-hours.test.ts`: fits/doesn't-fit, closed day,
  before-open vs after-close, status/deleted/past exclusions.
- **E2e** `tests/e2e/outside-hours.spec.ts`: (a) seed an upcoming order, narrow that
  day's hours via the editor → confirm dialog appears naming it → confirm →
  `/mimo-hodin` lists it + badge shows; (b) reschedule it into hours → row + badge
  drop live; (c) worker → 403 on `/mimo-hodin`, no badge; (d) the calendar card
  carries the "mimo hodín" marker.
- The existing NaN-clamp regression test (`calendar-header.spec.ts`) stays.

## 10. Files (no migration)

- `lib/orders/out-of-hours.ts` (new, pure) + unit test
- `lib/actions/orders.ts` — `getOutsideHoursOrders` / `getOutsideHoursCount`
- `lib/actions/settings.ts` — orphan pre-check + `allowOutsideHours` on the 3 actions
- `lib/validation/settings.ts` — `allowOutsideHours` on the schemas
- `lib/actions/result.ts` — optional `outsideHoursWarning?` on the failure result
- `app/mimo-hodin/page.tsx` (new) + `components/outside-hours/{outside-hours-list,outside-hours-badge}.tsx`
- `components/settings/{opening-hours-editor,day-overrides-editor}.tsx` + new
  `OutsideHoursConfirmDialog`
- `components/navigation/{AppShell,SidebarShell,Sidebar}.tsx` — thread the count + badge
- `components/calendar/{DayView,WeekView,BookingCard}.tsx` — the marker
- Specs 04 + 10 updated; e2e + unit as above.
