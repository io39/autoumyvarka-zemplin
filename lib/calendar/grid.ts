/**
 * Pure calendar grid/date math (UI redesign spec 14 §2.7). No I/O, no React —
 * shared by the calendar components and `app/page.tsx`, and unit-tested directly.
 */

/** One time-grid row = 15 minutes. */
export const SLOT_MIN = 15;
/** Pixel height of one 15-min row. */
export const ROW_PX = 24;

export interface Interval {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function diffMinutes(a: string, b: string): number {
  return toMinutes(b) - toMinutes(a);
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
