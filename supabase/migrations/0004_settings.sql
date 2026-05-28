-- 0004_settings.sql — opening hours & per-date overrides (spec 04).
-- Two tables: `opening_hours` (recurring weekly, one row per weekday) and
-- `day_overrides` (per-date exception). An override wins over the weekday row.
-- Phase 1 stores a single open-close interval per day (no split shifts);
-- if needed later, both tables would be promoted to multiple rows per day.
-- RLS deny-by-default, consistent with the baseline.

-- ---------------------------------------------------------------------------
-- opening_hours — recurring weekly schedule (data-model §2.12)
-- App convention: 0=Mon … 6=Sun.
-- ---------------------------------------------------------------------------
create table opening_hours (
  day_of_week smallint primary key check (day_of_week between 0 and 6),
  open_time   time,
  close_time  time,
  is_closed   boolean not null default false,
  -- When open: both times present and open < close.
  -- When closed: times must be NULL (single source of truth).
  check (
    (is_closed = true  and open_time is null and close_time is null) or
    (is_closed = false and open_time is not null and close_time is not null
     and open_time < close_time)
  )
);

comment on table opening_hours is 'Recurring weekly opening hours (0=Mon … 6=Sun); a day_overrides row for a given date wins over the weekday default.';

-- ---------------------------------------------------------------------------
-- day_overrides — per-date exception (data-model §2.13)
-- ---------------------------------------------------------------------------
create table day_overrides (
  day        date primary key,
  is_closed  boolean not null default true,
  open_time  time,
  close_time time,
  label      text,
  check (
    (is_closed = true  and open_time is null and close_time is null) or
    (is_closed = false and open_time is not null and close_time is not null
     and open_time < close_time)
  )
);

comment on table day_overrides is 'Per-date exceptions to weekly opening_hours. Wins over the weekday default.';

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default (no anon/authenticated policies). service_role bypasses.
-- ---------------------------------------------------------------------------
alter table opening_hours enable row level security;
alter table day_overrides enable row level security;
