# Spec 04 — Settings: opening hours & holidays

> **Status:** draft · **PRD refs:** §14 (Otváracie hodiny a sviatky) · **Depends
> on:** 01 (auth, audit, RLS baseline) · **Architecture refs:** §2 (authz) ·
> **Data-model refs:** §2.12 `opening_hours`, §2.13 `holidays`, §3 (RLS)

Configurable opening hours per weekday and one-off holidays/closed days. The calendar
(spec 05) renders closed hours greyed and the booking flow refuses slots outside open
time. This spec delivers the settings tables, the manager UI, and a small
**`isOpenAt(datetime)`** helper that booking and the calendar consume.

---

## 1. Requirements

### 1.1 What this feature does

1. **Opening hours per weekday** (Mon–Sun): open time, close time, or marked closed
   (PRD §14).
2. **Holidays / closed days:** one-off dates the wash is closed (PRD §14).
3. A **time-availability helper** `isOpenAt(datetime)` (and `getOpenInterval(date)`)
   that resolves a moment against weekday hours **and** holidays — the single source of
   truth used by the calendar (grey-out) and booking (slot validation).
4. **Manager-only** editing; both roles read (the calendar needs it).
5. Audit changes to hours/holidays (PRD §11).

### 1.2 User stories (PRD §14)

- As the **manager**, I set each weekday's open/close time and mark days we're closed,
  so the calendar and booking reflect reality.
- As the **manager**, I add a public holiday or a one-off closed day; the calendar greys
  it out and no reservation can be booked into it.
- As **either role**, the calendar shows closed periods greyed (spec 05 consumes this).

### 1.3 Non-goals

- No calendar rendering or booking validation here — those live in spec 05 and only
  **consume** this spec's helper.
- No per-box hours (both boxes share opening hours in Phase 1; nothing in the PRD
  suggests otherwise).
- No recurring-holiday automation (e.g. auto-importing state holidays) — holidays are
  entered manually. (Could be a later convenience; out of scope.)
- No partial-day / split-shift hours (single open–close interval per weekday). See the
  open question in §2.2.

### 1.4 Roles (PRD §3)

PRD §3's matrix doesn't list settings explicitly, but settings management is
administrative and sits beside "Správa katalógu služieb" and "Správa pracovníkov" —
both **manager-only**. So editing hours/holidays is **manager-only**; reading is
**both roles** (the calendar requires it).

---

## 2. Design

### 2.1 Routes & UI

| Route | Access | Purpose |
| --- | --- | --- |
| `/settings/hours` | **manager** | edit the 7 weekday rows (open/close/closed) |
| `/settings/holidays` | **manager** | list + add + remove one-off closed days |

- `prevadzka` → 403 view (spec 01).
- Hours: 7 rows (Mon–Sun), each a `Switch` (open/closed) + two time inputs. Save all in
  one action. shadcn/ui `Switch`, `Input[type=time]`, `Button`.
- Holidays: date picker + optional label, list with remove. shadcn `Calendar`/`Input`,
  `Table`. Mobile-first ≥360px; Slovak copy.

### 2.2 Time model & the availability helper

- Times stored as `time` (local wall-clock); the app interprets them in
  **Europe/Bratislava** and the helper converts against that zone (consistent with
  architecture: timestamps are `timestamptz` UTC, rendered in Bratislava).
- `lib/settings/availability.ts`:
  - `getOpenInterval(date)`: returns `{ open, close } | null` for a given local date —
    `null` if that weekday `is_closed` **or** the date is a holiday.
  - `isOpenAt(datetime)`: true iff the moment falls within that date's open interval.
  - `isRangeOpen(start, end)`: true iff the whole `[start, end)` is within one open
    interval (used by booking to reject orders that spill past close or into a holiday).

> **Open question (defaulting now, confirm with client):** the data model has a
> **single** open–close interval per weekday (`opening_hours.open_time/close_time`). If
> the wash ever has a lunch break / split shift, this can't express it. Defaulting to a
> single interval per PRD §14's phrasing; if split shifts are real, we promote
> `opening_hours` to multiple rows per weekday before building spec 05. Flagged, not
> blocking.

### 2.3 Server Actions (`lib/actions/settings.ts`)

All validate with zod, call `requireManager()`, write `audit_log`.

| Action | Input (zod) | Audit action |
| --- | --- | --- |
| `getOpeningHours` | — | — (read; both roles) |
| `getHolidays` | `{ from?, to? }` | — (read; both roles) |
| `saveOpeningHours` | `{ rows: [{ dayOfWeek 0–6, isClosed, openTime?, closeTime? }] × 7 }` | `settings.hours_update` |
| `addHoliday` | `{ day (date), label? }` | `settings.holiday_add` |
| `removeHoliday` | `{ day (date) }` | `settings.holiday_remove` |

- `saveOpeningHours` validates: when `isClosed=false`, both times present and
  `openTime < closeTime`; when `isClosed=true`, times ignored/cleared. Upserts all 7
  rows in one transaction.
- `addHoliday`: `day` unique (pk); duplicate → friendly Slovak notice (idempotent).

### 2.4 Data & migrations

Migration `0004_settings.sql`:
- `opening_hours` (pk `day_of_week`) + `holidays` (pk `day`) per data-model §2.12–§2.13.
- Enable RLS, deny-by-default (supabase-migrations skill).
- **Seed** `supabase/seed.sql`: 7 `opening_hours` rows with sensible defaults (e.g.
  Mon–Fri 08:00–17:00, Sat 08:00–12:00, Sun closed) so the local stack and a fresh prod
  are immediately usable. Confirm real defaults with the client; the seed is just a
  starting point and fully editable in the UI.

### 2.5 Error handling & loading states

- Typed action results `{ ok: false, message }` rendered inline (Slovak), e.g.
  "Čas otvorenia musí byť pred časom zatvorenia".
- `/settings/*` use a loading skeleton; holidays empty-state copy in Slovak.

---

## 3. Tasks

1. **(S)** Migration `0004_settings.sql` (both tables, RLS deny-by-default) + seed 7
   default weekday rows. (dep: spec 01 baseline)
2. **(M)** `lib/settings/availability.ts` (`getOpenInterval`, `isOpenAt`,
   `isRangeOpen`) with timezone handling + unit tests. (dep: 1)
3. **(M)** zod schemas + `lib/actions/settings.ts` (reads + `saveOpeningHours`,
   `addHoliday`, `removeHoliday`) with `requireManager` + audit. (dep: 1)
4. **(M)** `/settings/hours` UI (7-row editor, single save). (dep: 3)
5. **(S)** `/settings/holidays` UI (add/remove + list). (dep: 3)
6. **(M)** Tests: unit (availability across weekday/holiday/closed/boundary cases) +
   e2e (manager edits hours & holidays; worker 403; validation rejects open≥close).
   (dep: 4, 5)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck   # exits 0
pnpm lint        # exits 0
pnpm test        # exits 0
pnpm build       # exits 0
```

### 4.2 Migration, RLS & seed

```bash
supabase db reset   # applies 0004 + seed, exits 0
# RLS enabled, deny-by-default (rowsecurity=t, 0 anon policies):
psql "$LOCAL_DB_URL" -c \
  "select tablename, rowsecurity from pg_tables \
   where tablename in ('opening_hours','holidays') order by 1;"
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_policies \
   where tablename in ('opening_hours','holidays') and 'anon' = any(roles);"
# Exactly 7 weekday rows seeded (expect 7):
psql "$LOCAL_DB_URL" -c "select count(*) from opening_hours;"
# No open row has open_time >= close_time (expect 0):
psql "$LOCAL_DB_URL" -c \
  "select count(*) from opening_hours \
   where is_closed = false and open_time >= close_time;"
```

### 4.3 Availability helper (unit, must pass)

- A datetime inside a weekday's open interval → `isOpenAt` true; before open / after
  close → false (boundary: exactly `close_time` is closed).
- A datetime on a weekday marked `is_closed` → false.
- A datetime on a holiday date → false even if the weekday is open.
- `isRangeOpen(start, end)` false when the range crosses `close_time` or a holiday.

```bash
pnpm test settings/availability   # exits 0
```

### 4.4 Authorization (e2e, must pass)

- As **prevádzka**: `/settings/hours` and `/settings/holidays` → 403;
  `saveOpeningHours`/`addHoliday`/`removeHoliday` rejected with `ForbiddenError`.
- As **manažér**: edit hours (incl. marking a day closed), add and remove a holiday —
  all succeed and persist.

```bash
pnpm test e2e/settings-permissions   # exits 0
```

### 4.5 Validation & audit (e2e, must pass)

- `saveOpeningHours` with `openTime >= closeTime` on an open day → rejected (Slovak
  message), no partial write.
- Adding a duplicate holiday date → idempotent notice, single row.
- `saveOpeningHours` → `audit_log` `settings.hours_update`; `addHoliday` →
  `settings.holiday_add`; `removeHoliday` → `settings.holiday_remove`.

```bash
pnpm test e2e/settings-audit   # exits 0
```

### 4.6 Manual checks

- [ ] `/settings/hours` 7-row editor usable at 360px; closed-day toggle disables the
      time inputs.
- [ ] All visible strings Slovak; weekday names Slovak (Pondelok … Nedeľa).
- [ ] Adding a holiday immediately reflects in `getHolidays`.
