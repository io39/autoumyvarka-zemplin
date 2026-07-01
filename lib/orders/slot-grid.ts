/**
 * Pure math for the interactive booking slot picker (Step 4). All times are
 * Bratislava-local minutes-from-midnight on a single day, so there is no
 * timezone handling here — the component converts the chosen start back to a
 * UTC instant via `bratislavaLocalToISO`. No I/O; unit-tested directly.
 */

/** Slot granularity, in minutes. Must equal `SLOT_MIN` in lib/calendar/grid.ts. */
const STEP_MIN = 15;

/** A busy (occupied) interval on one box, in local minutes. */
export interface BusyInterval {
  startMin: number;
  endMin: number;
}

export interface Range {
  startMin: number;
  endMin: number;
}

export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minToHHMM(min: number): string {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Floor / ceil minutes-of-day to the 15-min slot grid. */
export function floorToStep(min: number): number {
  return Math.floor(min / STEP_MIN) * STEP_MIN;
}
export function ceilToStep(min: number): number {
  return Math.ceil(min / STEP_MIN) * STEP_MIN;
}

/**
 * The shared picker axis range: the union of the days' open intervals AND every
 * visible booking's extent, snapped OUT to the 15-min grid so the origin always
 * lands on a quarter-hour. Returns `fallback` when there is nothing to union.
 *
 * The snap is load-bearing: an out-of-hours booking can start off-grid (e.g.
 * 07:39, created before a manager narrowed the hours). Without flooring, that
 * start would become the axis origin and — because a clicked start is
 * `origin + row × 15` — every pickable time would inherit the 9-min offset and be
 * rejected by `createOrder`'s "must be on the quarter-hour" check. Mirrors the
 * main calendar's `floorTo15`/`ceilTo15` range extension.
 */
export function unionSlotRange(intervals: Range[], blocks: Range[], fallback: Range): Range {
  let startMin: number | null = null;
  let endMin: number | null = null;
  const fold = (a: number, b: number) => {
    startMin = startMin === null ? a : Math.min(startMin, a);
    endMin = endMin === null ? b : Math.max(endMin, b);
  };
  for (const iv of intervals) fold(iv.startMin, iv.endMin);
  for (const b of blocks) fold(b.startMin, b.endMin);
  if (startMin === null || endMin === null) return { ...fallback };
  return { startMin: floorToStep(startMin), endMin: ceilToStep(endMin) };
}

/**
 * Free gaps within `[openMin, closeMin)` not covered by any busy interval.
 * Busy intervals may overlap/extend past the open window; they are clamped.
 */
export function computeFreeZones(openMin: number, closeMin: number, busy: BusyInterval[]): Range[] {
  if (closeMin <= openMin) return [];
  const sorted = busy
    .filter((b) => b.endMin > openMin && b.startMin < closeMin)
    .sort((a, b) => a.startMin - b.startMin);

  const zones: Range[] = [];
  let cursor = openMin;
  for (const b of sorted) {
    const s = Math.max(b.startMin, openMin);
    if (s > cursor) zones.push({ startMin: cursor, endMin: s });
    cursor = Math.max(cursor, Math.min(b.endMin, closeMin));
  }
  if (cursor < closeMin) zones.push({ startMin: cursor, endMin: closeMin });
  return zones;
}

/**
 * Can a booking of `durationMin` start at `startMin` without overlapping a busy
 * interval or spilling past close (and not before open)?
 */
export function fitsAt(
  startMin: number,
  durationMin: number,
  openMin: number,
  closeMin: number,
  busy: BusyInterval[],
): boolean {
  if (durationMin <= 0) return false;
  const endMin = startMin + durationMin;
  if (startMin < openMin || endMin > closeMin) return false;
  return !busy.some((b) => startMin < b.endMin && endMin > b.startMin);
}

/** Every 15-min start in the day at which `durationMin` fits. */
export function validStarts(
  openMin: number,
  closeMin: number,
  durationMin: number,
  busy: BusyInterval[],
): number[] {
  const out: number[] = [];
  for (let m = openMin; m + durationMin <= closeMin; m += STEP_MIN) {
    if (fitsAt(m, durationMin, openMin, closeMin, busy)) out.push(m);
  }
  return out;
}

/** The nearest valid starts at/after `fromMin` (past cutoff for today), capped. */
export function nearestFreeStarts(
  openMin: number,
  closeMin: number,
  durationMin: number,
  busy: BusyInterval[],
  fromMin: number,
  limit: number,
): number[] {
  return validStarts(openMin, closeMin, durationMin, busy)
    .filter((m) => m >= fromMin)
    .slice(0, limit);
}

/**
 * The earliest 15-min start still bookable for *today* given the current local
 * time `nowMin`: the start of the slot **containing** `nowMin`. The slot the
 * clock is currently in stays selectable; a slot closes only once the clock
 * crosses into the next one (e.g. at 11:05 the 11:00 slot is still pickable,
 * and at 13:16 the 13:00 slot is closed while 13:15 is the earliest pick).
 */
export function earliestStartToday(nowMin: number): number {
  return Math.floor(nowMin / STEP_MIN) * STEP_MIN;
}

/** Snap a pixel offset within a column to a 15-min start (minutes-from-midnight). */
export function offsetToStartMin(offsetPx: number, openMin: number, rowPx: number): number {
  const row = Math.max(0, Math.floor(offsetPx / rowPx));
  return openMin + row * STEP_MIN;
}
