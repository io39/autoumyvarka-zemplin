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
 * time `nowMin`: the start of the slot **after** the one containing `nowMin`, so
 * a slot is closed as soon as the clock enters it (e.g. at 13:16 the 13:15 slot
 * is already closed and 13:30 is the earliest pick).
 */
export function earliestStartToday(nowMin: number): number {
  return Math.floor(nowMin / STEP_MIN) * STEP_MIN + STEP_MIN;
}

/** Snap a pixel offset within a column to a 15-min start (minutes-from-midnight). */
export function offsetToStartMin(offsetPx: number, openMin: number, rowPx: number): number {
  const row = Math.max(0, Math.floor(offsetPx / rowPx));
  return openMin + row * STEP_MIN;
}
