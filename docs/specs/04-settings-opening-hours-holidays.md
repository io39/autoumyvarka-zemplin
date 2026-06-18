# Spec 04 — Settings: opening hours & day overrides

> **Status:** draft · **PRD refs:** §14 (Otváracie hodiny a sviatky) · **Depends
> on:** 01 (auth, audit, RLS baseline) · **Architecture refs:** §2 (authz) ·
> **Data-model refs:** §2.12 `opening_hours`, §2.13 `day_overrides`, §3 (RLS)

Configurable **recurring weekly** opening hours, plus **per-date overrides** for
special occasions — a date can be fully closed *or* open with custom hours (e.g. a
shortened holiday). The calendar (spec 05) renders closed periods greyed and booking
refuses slots outside open time. This spec delivers the settings tables, the manager
UI, and a small **availability helper** that booking and the calendar consume.

---

## 1. Requirements

### 1.1 What this feature does

1. **Recurring weekly opening hours** (Mon–Sun): open time, close time, or marked
   closed — set once, repeats every week (PRD §14).
2. **Per-date overrides** (`day_overrides`): for a specific date, either **close** the
   wash or set **custom open/close hours** that win over the weekday default (e.g. 24
   Dec 08:00–12:00). This is the manual per-occasion exception layer (PRD §14).
3. A **time-availability helper** that resolves a moment against the override (if any)
   else the weekday hours — the single source of truth for the calendar (grey-out) and
   booking (slot validation).
4. **Manager-only** editing; both roles read (the calendar needs it).
5. Audit changes to hours and overrides (PRD §11).

### 1.2 User stories (PRD §14)

- As the **manager**, I set each weekday's open/close time once; it repeats weekly, so
  the calendar and booking reflect our normal schedule without re-entry.
- As the **manager**, for a holiday or special day I add a date override — either
  closed, or with shortened hours — and the calendar + booking immediately respect it.
- As **either role**, the calendar shows closed periods greyed (spec 05 consumes this).

### 1.3 Non-goals

- No calendar rendering or booking validation here — those live in spec 05 and only
  **consume** this spec's helper.
- No per-box hours (both boxes share opening hours in Phase 1; nothing in the PRD
  suggests otherwise).
- No recurring-override automation (e.g. auto-importing state holidays) — overrides are
  entered manually. (Could be a later convenience; out of scope.)
- No split-shift / multiple intervals in a single day (one open–close interval per day,
  whether from the weekday default or an override). See the open question in §2.2.

### 1.4 Roles (PRD §3)

PRD §3's matrix doesn't list settings explicitly, but settings management is
administrative and sits beside "Správa katalógu služieb" and "Správa pracovníkov" —
both **manager-only**. So editing hours/overrides is **manager-only**; reading is
**both roles** (the calendar requires it).

---

## 2. Design

### 2.1 Routes & UI

| Route | Access | Purpose |
| --- | --- | --- |
| `/settings/hours` | **manager** | edit the 7 recurring weekday rows (open/close/closed) |
| `/settings/exceptions` | **manager** | list + add + edit + remove per-date overrides |

- `prevadzka` → 403 view (spec 01).
- Hours: 7 rows (Mon–Sun), each a `Switch` (open/closed) + two time inputs. Save all in
  one action. shadcn/ui `Switch`, `Input[type=time]`, `Button`. **Time inputs use a
  15-minute step** (`step=900`) and the save action validates that `openTime`/`closeTime`
  fall on a 15-minute boundary — so the calendar's 15-minute slot grid (spec 05) starts
  and ends cleanly with no partial slot at the edges.
- Exceptions: date picker + a closed/custom-hours toggle + (when custom) two 15-min time
  inputs + optional label; list with edit/remove. shadcn `Calendar`/`Input`, `Switch`,
  `Table`. Mobile-first ≥360px; Slovak copy.

### 2.2 Time model & the availability helper

- Times stored as `time` (local wall-clock); the app interprets them in
  **Europe/Bratislava** and the helper converts against that zone (consistent with
  architecture: timestamps are `timestamptz` UTC, rendered in Bratislava).
- **Resolution order:** for any date, a `day_overrides` row (if present) **wins** over
  the weekday `opening_hours` row.
- `lib/settings/availability.ts`:
  - `getOpenInterval(date)`: returns `{ open, close } | null` for a local date.
    `null` if the override marks it closed, or (no override) the weekday `is_closed`.
    A custom-hours override returns its `{ open, close }`.
  - `isOpenAt(datetime)`: true iff the moment falls within that date's open interval.
  - `isRangeOpen(start, end)`: true iff the whole `[start, end)` is within one open
    interval (booking uses it to reject orders that spill past close or into a closed
    date).

> **Open question (defaulting now, confirm with client):** the model allows a **single**
> open–close interval per day (weekday default or override). It can't express a lunch
> break / split shift within one day. Defaulting to a single interval per PRD §14's
> phrasing; if split shifts are real, both `opening_hours` and `day_overrides` would be
> promoted to multiple rows per day before spec 05 builds on this. Flagged, not blocking.

### 2.3 Server Actions (`lib/actions/settings.ts`)

All validate with zod, call `requireManager()`, write `audit_log`.

| Action | Input (zod) | Audit action |
| --- | --- | --- |
| `getOpeningHours` | — | — (read; both roles) |
| `getDayOverrides` | `{ from?, to? }` | — (read; both roles) |
| `saveOpeningHours` | `{ rows: [{ dayOfWeek 0–6, isClosed, openTime?, closeTime? }] × 7, allowOutsideHours? }` | `settings.hours_update` |
| `upsertDayOverride` | `{ day, isClosed, openTime?, closeTime?, label?, allowOutsideHours? }` | `settings.override_set` |
| `removeDayOverride` | `{ day, allowOutsideHours? }` | `settings.override_remove` |

- `saveOpeningHours` validates: when `isClosed=false`, both times present,
  `openTime < closeTime`, and **both on a 15-minute boundary** (minutes ∈ {00,15,30,45},
  seconds 0); when `isClosed=true`, times ignored/cleared. Upserts all 7 rows in one
  transaction.
- `upsertDayOverride` validates: when `isClosed=false`, both times present,
  `openTime < closeTime`, both on a 15-minute boundary; when `isClosed=true`, times
  cleared. Keyed by `day` (pk) → idempotent upsert (re-saving the same date edits it).

#### Warn-but-allow: hours changes that orphan existing orders

Orders are always created **inside** hours (`createOrder`/`moveOrder` enforce
`isRangeOpen`), so the only way an order ends up outside hours is a manager **narrowing
or closing** hours after it already exists. All three mutating actions guard against
silently orphaning upcoming orders, mirroring the box-overlap `allowOverlap` mechanism:

- Before writing, each action recomputes upcoming **`vytvorena`** orders (today onward;
  `upsert`/`remove` scoped to the affected date) against the **proposed** config and flags
  the ones **newly** orphaned — *outside the proposed hours **and** inside the current
  hours* (so an unrelated save isn't blocked by a pre-existing out-of-hours order). The
  shared predicate is `isOutsideHours` (`lib/orders/out-of-hours.ts`, reusing `isRangeOpen`).
- If any are newly orphaned and `allowOutsideHours` is not `true`, the action **does not
  save** — it returns a soft `{ ok:false, message, outsideHoursWarning: { count, sample } }`
  (`sample` = up to 5 car·date·time labels). The hours editors show a confirm dialog
  (`OutsideHoursConfirmDialog`) naming them; confirming re-calls the action with
  `allowOutsideHours: true`, which saves. No extra audit beyond the normal hours audit.
- The orphaned orders then surface on the manager worklist `/mimo-hodin` (spec 10 §2.7)
  until rescheduled/cancelled.

### 2.4 Data & migrations

Migration `0004_settings.sql`:
- `opening_hours` (pk `day_of_week`) + `day_overrides` (pk `day`) per data-model
  §2.12–§2.13, incl. the `is_closed` ⇒ times-null / `open<close` shape.
- Enable RLS, deny-by-default (supabase-migrations skill).
- **Seed** `supabase/seed.sql`: 7 `opening_hours` rows with sensible defaults (e.g.
  Mon–Fri 08:00–17:00, Sat 08:00–12:00, Sun closed) so the local stack and a fresh prod
  are immediately usable. Confirm real defaults with the client; the seed is just a
  starting point and fully editable in the UI. No override rows seeded.

### 2.5 Error handling & loading states

- Typed action results `{ ok: false, message }` rendered inline (Slovak), e.g.
  "Čas otvorenia musí byť pred časom zatvorenia".
- `/settings/*` use a loading skeleton; the exceptions list has Slovak empty-state copy.

---

## 3. Tasks

1. **(S)** Migration `0004_settings.sql` (both tables, RLS deny-by-default) + seed 7
   default weekday rows. (dep: spec 01 baseline)
2. **(M)** `lib/settings/availability.ts` (`getOpenInterval`, `isOpenAt`,
   `isRangeOpen`) with override-wins resolution + timezone handling + unit tests. (dep: 1)
3. **(M)** zod schemas + `lib/actions/settings.ts` (reads + `saveOpeningHours`,
   `upsertDayOverride`, `removeDayOverride`) with `requireManager` + audit. (dep: 1)
4. **(M)** `/settings/hours` UI (7-row editor, single save). (dep: 3)
5. **(M)** `/settings/exceptions` UI (add/edit/remove; closed vs custom-hours toggle).
   (dep: 3)
6. **(M)** Tests: unit (availability across weekday / override-closed / override-custom
   / boundary cases) + e2e (manager edits hours & overrides; worker 403; validation
   rejects open≥close and non-15-min). (dep: 4, 5)

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
   where tablename in ('opening_hours','day_overrides') order by 1;"
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_policies \
   where tablename in ('opening_hours','day_overrides') and 'anon' = any(roles);"
# Exactly 7 weekday rows seeded (expect 7):
psql "$LOCAL_DB_URL" -c "select count(*) from opening_hours;"
# No open row (in either table) has open_time >= close_time (expect 0):
psql "$LOCAL_DB_URL" -c \
  "select count(*) from opening_hours where is_closed = false and open_time >= close_time;"
psql "$LOCAL_DB_URL" -c \
  "select count(*) from day_overrides where is_closed = false and open_time >= close_time;"
```

### 4.3 Availability helper (unit, must pass)

- A datetime inside a weekday's open interval → `isOpenAt` true; before open / after
  close → false (boundary: exactly `close_time` is closed).
- A datetime on a weekday marked `is_closed` (no override) → false.
- A datetime on a date with a **closed** override → false even if the weekday is open.
- A datetime on a date with a **custom-hours** override → uses the override interval,
  **not** the weekday hours (true inside the override window, false outside).
- `isRangeOpen(start, end)` false when the range crosses the effective `close_time` or
  a closed date.

```bash
pnpm test settings/availability   # exits 0
```

### 4.4 Authorization (e2e, must pass)

- As **prevádzka**: `/settings/hours` and `/settings/exceptions` → 403;
  `saveOpeningHours`/`upsertDayOverride`/`removeDayOverride` rejected with `ForbiddenError`.
- As **manažér**: edit hours (incl. marking a weekday closed), add a closed override, add
  a custom-hours override, edit and remove an override — all succeed and persist.

```bash
pnpm test e2e/settings-permissions   # exits 0
```

### 4.5 Validation & audit (e2e, must pass)

- `saveOpeningHours` or `upsertDayOverride` with `openTime >= closeTime` on an open
  day → rejected (Slovak message), no partial write.
- A non-15-minute time (e.g. `08:07`) → rejected, no write.
- Re-saving an override for an existing date edits the single row (idempotent upsert),
  no duplicate.
- `saveOpeningHours` → `audit_log` `settings.hours_update`; `upsertDayOverride` →
  `settings.override_set`; `removeDayOverride` → `settings.override_remove`.

```bash
pnpm test e2e/settings-audit   # exits 0
```

### 4.6 Manual checks

- [ ] `/settings/hours` 7-row editor usable at 360px; closed-day toggle disables the
      time inputs.
- [ ] `/settings/exceptions` toggle switches between "closed" and "custom hours"; custom
      mode reveals the two 15-min time inputs.
- [ ] All visible strings Slovak; weekday names Slovak (Pondelok … Nedeľa).
- [ ] Adding/editing an override immediately reflects in `getDayOverrides`.
