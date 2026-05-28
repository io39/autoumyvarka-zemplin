import type { DayOverrideRow, OpeningHoursRow } from "@/lib/supabase/types";

/**
 * Opening-hours availability resolver (spec 04). Pure / DB-free so it
 * can be unit-tested in isolation; callers fetch the two row sets and
 * pass them in.
 *
 * Resolution order (PRD §14): a `day_overrides` row for the local date,
 * if any, WINS over that weekday's `opening_hours` row.
 *
 * Times are stored as Postgres `time` (HH:MM:SS); the app interprets
 * them in **Europe/Bratislava** local wall-clock — consistent with
 * architecture: timestamps are `timestamptz` UTC, rendered in
 * Bratislava (data-model §1).
 */

const TZ = "Europe/Bratislava";

export interface OpenInterval {
  /** Local "HH:MM" — inclusive lower bound. */
  open: string;
  /** Local "HH:MM" — exclusive upper bound (a moment at close_time is closed). */
  close: string;
}

/** "YYYY-MM-DD" in Bratislava local time. */
export function bratislavaDateKey(d: Date): string {
  const parts = bratislavaParts(d);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** 0 = Monday … 6 = Sunday — app convention (data-model §2.12). */
export function bratislavaDayOfWeek(d: Date): number {
  // Build a UTC midnight from the local-date string so getUTCDay()
  // returns the weekday for that local date regardless of the test
  // runner's timezone.
  const utc = new Date(`${bratislavaDateKey(d)}T00:00:00Z`);
  const jsDay = utc.getUTCDay(); // 0 = Sun … 6 = Sat
  return (jsDay + 6) % 7; // 0 = Mon … 6 = Sun
}

/** Local "HH:MM" (Bratislava). */
export function bratislavaHHMM(d: Date): string {
  const parts = bratislavaParts(d);
  return `${parts.hour}:${parts.minute}`;
}

/** Resolve the effective open/close interval for the local date of `dt`. */
export function getOpenInterval(
  dt: Date,
  hours: OpeningHoursRow[],
  overrides: DayOverrideRow[],
): OpenInterval | null {
  const key = bratislavaDateKey(dt);
  const override = overrides.find((o) => o.day === key);
  if (override) {
    if (override.is_closed) return null;
    if (!override.open_time || !override.close_time) return null;
    return { open: hhmm(override.open_time), close: hhmm(override.close_time) };
  }
  const dow = bratislavaDayOfWeek(dt);
  const weekday = hours.find((h) => h.day_of_week === dow);
  if (!weekday || weekday.is_closed) return null;
  if (!weekday.open_time || !weekday.close_time) return null;
  return { open: hhmm(weekday.open_time), close: hhmm(weekday.close_time) };
}

/** True iff `dt` falls inside the date's open interval. close_time itself is closed. */
export function isOpenAt(
  dt: Date,
  hours: OpeningHoursRow[],
  overrides: DayOverrideRow[],
): boolean {
  const interval = getOpenInterval(dt, hours, overrides);
  if (!interval) return false;
  const t = bratislavaHHMM(dt);
  return t >= interval.open && t < interval.close;
}

/**
 * True iff the whole `[start, end)` lies within one open interval on a
 * single local date. Spanning midnight or a closed boundary returns false.
 */
export function isRangeOpen(
  start: Date,
  end: Date,
  hours: OpeningHoursRow[],
  overrides: DayOverrideRow[],
): boolean {
  if (!(start < end)) return false;
  if (bratislavaDateKey(start) !== bratislavaDateKey(end)) return false;
  const interval = getOpenInterval(start, hours, overrides);
  if (!interval) return false;
  const s = bratislavaHHMM(start);
  const e = bratislavaHHMM(end);
  return s >= interval.open && e <= interval.close;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function bratislavaParts(d: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  // `en-GB` with hour12:false can emit hour "24" for midnight — normalize.
  if (parts.hour === "24") parts.hour = "00";
  return parts;
}

/** "08:00" or "08:00:00" → "08:00". */
function hhmm(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}
