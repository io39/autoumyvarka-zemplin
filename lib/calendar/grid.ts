/**
 * Pure calendar grid/date math (UI redesign spec 14 §2.7). No I/O, no React —
 * shared by the calendar components and `app/page.tsx`, and unit-tested directly.
 */

/** One time-grid row = 15 minutes. */
export const SLOT_MIN = 15;
/**
 * Base pixel height of one 15-min row, and the *minimum* on the Day view and the
 * Step-4 picker (rows grow to fit a short booking — see `computeRowLayout`). The
 * Week view keeps a fixed row height.
 */
export const ROW_PX = 20;

/**
 * A booking shorter than this many px (e.g. 15 min ≈ ROW_PX) grows its 15-min
 * grid row(s) so its content (car name + services) stays readable and its bottom
 * still lines up with the time axis. Shared by the Day view and the Step-4 picker.
 */
export const MIN_CARD_PX = 42;

/**
 * Approx. rendered height of one wrapped note line (text-xs, leading-tight).
 * Deliberately **less than `ROW_PX`**: a note line takes less vertical space than
 * a 15-min grid row, so a booking that already spans enough rows to show its note
 * is not stretched (its own duration height absorbs the note).
 */
export const NOTE_LINE_PX = 15;
/**
 * Always-present part of a note-bearing Day card: the car/price row + the services
 * row + card padding. The note lines are added on top of this.
 */
export const NOTE_BASE_PX = 36;
/**
 * Rough characters-per-line used to estimate how many lines a Day-view note wraps
 * to. Cards vary in width (single-lane cards are wide; overlapping lanes narrow),
 * so this is a deliberately conservative estimate, not a measurement — tune if
 * notes clip or over-reserve. Cap the estimate at 3 lines (the note's `line-clamp-3`).
 */
export const NOTE_CHARS_PER_LINE = 24;

/**
 * Estimated minimum card height (px) for a Day-view booking that carries a note,
 * so its row(s) grow just enough to show the note **without reserving space up
 * front and without stretching a booking that is already tall enough**: a short
 * note stays at ~1 extra line, a long one grows to at most 3 (matching the note's
 * `line-clamp-3`). Because each line costs `NOTE_LINE_PX < ROW_PX`, a booking whose
 * duration already spans the needed rows keeps its height (`computeRowLayout`'s
 * deficit is 0). Length-based estimate — see `NOTE_CHARS_PER_LINE`.
 */
export function noteCardMinPx(noteLength: number): number {
  const lines = Math.min(3, Math.max(1, Math.ceil(noteLength / NOTE_CHARS_PER_LINE)));
  return NOTE_BASE_PX + lines * NOTE_LINE_PX;
}

export interface Interval {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

/**
 * Variable row heights for `n` 15-min slots: every row is `ROW_PX`, plus any
 * extra a short booking needs, spread across the rows it spans (the max wins
 * where rows are shared between lanes/boxes). Returns the per-row `heights` and
 * the cumulative `top` offsets (length `n + 1`, so `top[n]` is the total height).
 * Items are `{ startMin, endMin }` in minutes-from-grid-open, with an optional
 * `minPx` (e.g. a card with a note row needs a taller minimum than `MIN_CARD_PX`).
 */
export function computeRowLayout(
  items: { startMin: number; endMin: number; minPx?: number }[],
  n: number,
): { heights: number[]; top: number[] } {
  const extra = new Array<number>(n).fill(0);
  for (const it of items) {
    const s = Math.max(0, Math.min(n - 1, Math.round(it.startMin / SLOT_MIN)));
    const e = Math.min(n, Math.max(s + 1, Math.round(it.endMin / SLOT_MIN)));
    const span = e - s;
    const deficit = Math.max(0, (it.minPx ?? MIN_CARD_PX) - span * ROW_PX);
    if (deficit === 0) continue;
    const perRow = deficit / span;
    for (let i = s; i < e; i++) extra[i] = Math.max(extra[i], perRow);
  }
  const heights = extra.map((x) => ROW_PX + x);
  const top = [0];
  for (let i = 0; i < n; i++) top.push(top[i] + heights[i]);
  return { heights, top };
}

/** The 15-min slot index a pixel offset falls in, given cumulative row `top`s. */
export function slotAtOffset(top: number[], offsetPx: number): number {
  if (offsetPx <= 0) return 0;
  for (let i = 0; i < top.length - 1; i++) {
    if (offsetPx < top[i + 1]) return i;
  }
  return Math.max(0, top.length - 2);
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Display a "YYYY-MM-DD" key as the app-wide UI date "DD.MM.YYYY". */
export function formatDMY(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

/** Slovak short weekday names, Monday-first (0=Mon..6=Sun). */
const SK_WEEKDAY_SHORT = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"] as const;

/** Day-of-week for a "YYYY-MM-DD" key: 0=Mon..6=Sun (TZ-safe). */
export function dayOfWeek(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  return (probe.getUTCDay() + 6) % 7;
}

/** Slovak short weekday with trailing dot for a key, e.g. "Po." */
export function skWeekdayShort(key: string): string {
  return `${SK_WEEKDAY_SHORT[dayOfWeek(key)]}.`;
}

/**
 * Compact "from – to" label for a week range, collapsing the shared parts:
 * same month+year → "01 – 07.06.2026"; same year → "30.06 – 06.07.2026";
 * else the full both-ends form "30.12.2025 – 06.01.2026".
 */
export function formatWeekRange(fromKey: string, toKey: string): string {
  const [fy, fm, fd] = fromKey.split("-");
  const [ty, tm, td] = toKey.split("-");
  if (fy === ty && fm === tm) return `${fd} – ${td}.${tm}.${ty}`;
  if (fy === ty) return `${fd}.${fm} – ${td}.${tm}.${ty}`;
  return `${formatDMY(fromKey)} – ${formatDMY(toKey)}`;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function diffMinutes(a: string, b: string): number {
  return toMinutes(b) - toMinutes(a);
}

/** Round an "HH:MM" down to the 15-min grid (e.g. 06:07 → 06:00). */
export function floorTo15(hhmm: string): string {
  const m = Math.floor(toMinutes(hhmm) / SLOT_MIN) * SLOT_MIN;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * Round an "HH:MM" up to the 15-min grid (e.g. 06:55 → 07:00). Callers pass
 * booking end times, which are ≤ 23:45 in practice (orders are created inside
 * hours on a 15-min boundary), so this never has to produce "24:00".
 */
export function ceilTo15(hhmm: string): string {
  const m = Math.ceil(toMinutes(hhmm) / SLOT_MIN) * SLOT_MIN;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "HH:MM" rows on a 15-min grid from `open` (inclusive) to `close` (exclusive). */
export function buildRows(open: string, close: string): string[] {
  const o = toMinutes(open);
  const c = toMinutes(close);
  const out: string[] = [];
  for (let m = o; m < c; m += SLOT_MIN) {
    out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return out;
}

/** 7 Bratislava-local date keys for the week containing `dateKey`, Monday first. */
export function weekDateKeys(dateKey: string): string[] {
  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = (probe.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const monday = new Date(probe);
  monday.setUTCDate(monday.getUTCDate() - dow);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d2 = new Date(monday);
    d2.setUTCDate(monday.getUTCDate() + i);
    out.push(`${d2.getUTCFullYear()}-${pad(d2.getUTCMonth() + 1)}-${pad(d2.getUTCDate())}`);
  }
  return out;
}

/** Monday→Sunday key range for the week containing `dateKey`. */
export function weekRange(dateKey: string): { from: string; to: string } {
  const keys = weekDateKeys(dateKey);
  return { from: keys[0], to: keys[6] };
}

/** Shift a "YYYY-MM-DD" key by `n` days (calendar-safe, no TZ drift). */
export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  probe.setUTCDate(probe.getUTCDate() + n);
  return `${probe.getUTCFullYear()}-${pad(probe.getUTCMonth() + 1)}-${pad(probe.getUTCDate())}`;
}
