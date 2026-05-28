import type { DayOverrideRow, OpeningHoursRow } from "@/lib/supabase/types";
import {
  bratislavaDateKey,
  bratislavaHHMM,
  getOpenInterval,
} from "@/lib/settings/availability";

/** A 15-minute slot proposal. */
export interface SlotProposal {
  /** UTC instant for `starts_at`. */
  startsAt: Date;
  /** Local "HH:MM" in Bratislava — what we show in the picker. */
  localStart: string;
  box: number;
}

/** [startsAt, endsAt) of a known order on a given box. */
export interface BoxBusyInterval {
  box: number;
  startsAt: Date;
  endsAt: Date;
}

/** True iff `start` lies on a :00/:15/:30/:45 minute boundary (UTC ms). */
export function isOn15MinBoundary(start: Date): boolean {
  return start.getTime() % (15 * 60 * 1000) === 0;
}

/** Snap a Date down to the previous 15-min boundary. */
export function floorTo15Min(d: Date): Date {
  const ms = 15 * 60 * 1000;
  return new Date(Math.floor(d.getTime() / ms) * ms);
}

/**
 * Enumerate 15-minute slot starts within the given Bratislava-local date's
 * open interval that can fit `durationMin` without spilling past close. Each
 * candidate is also checked against the supplied busy intervals (per box).
 * Returns at most `limit` proposals per box.
 */
export function suggestFreeSlots(input: {
  date: Date;
  durationMin: number;
  hours: OpeningHoursRow[];
  overrides: DayOverrideRow[];
  busy: BoxBusyInterval[];
  boxes?: number[];
  limit?: number;
}): SlotProposal[] {
  const { date, durationMin, hours, overrides, busy } = input;
  const boxes = input.boxes ?? [1, 2];
  const limit = input.limit ?? 8;

  const interval = getOpenInterval(date, hours, overrides);
  if (!interval || durationMin <= 0) return [];

  const dateKey = bratislavaDateKey(date);
  const candidates = enumerateLocalSlotStarts(dateKey, interval.open, interval.close, durationMin);
  if (candidates.length === 0) return [];

  const proposals: SlotProposal[] = [];
  for (const box of boxes) {
    const busyOnBox = busy.filter((b) => b.box === box);
    let taken = 0;
    for (const c of candidates) {
      if (taken >= limit) break;
      const end = new Date(c.getTime() + durationMin * 60 * 1000);
      if (!fitsInOpenInterval(c, end, interval)) continue;
      if (overlapsAny(c, end, busyOnBox)) continue;
      proposals.push({ startsAt: c, localStart: bratislavaHHMM(c), box });
      taken++;
    }
  }
  return proposals;
}

/** True iff `[start, end)` overlaps any interval in `busy`. */
export function overlapsAny(start: Date, end: Date, busy: BoxBusyInterval[]): boolean {
  return busy.some((b) => start < b.endsAt && end > b.startsAt);
}

// ---------------------------------------------------------------------------
// internal
// ---------------------------------------------------------------------------

function fitsInOpenInterval(
  start: Date,
  end: Date,
  interval: { open: string; close: string },
): boolean {
  const s = bratislavaHHMM(start);
  const e = bratislavaHHMM(end);
  return s >= interval.open && e <= interval.close;
}

/**
 * Build all 15-min `Date`s between local `open` and `close` (latest slot is
 * the last that can fit `durationMin` before close).
 */
function enumerateLocalSlotStarts(
  dateKey: string,
  open: string,
  close: string,
  durationMin: number,
): Date[] {
  const out: Date[] = [];
  const openMin = toMinutes(open);
  const closeMin = toMinutes(close);
  const latestStart = closeMin - durationMin;
  for (let m = openMin; m <= latestStart; m += 15) {
    out.push(localBratislavaToUTC(dateKey, m));
  }
  return out;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Convert a (Bratislava-local) `YYYY-MM-DD` + minutes-past-midnight into the
 * corresponding UTC `Date`. Probes ±2h around the naïve UTC instant and
 * picks the one whose local rendering matches — robust across DST.
 */
function localBratislavaToUTC(dateKey: string, minutes: number): Date {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const target = `${pad(hh)}:${pad(mm)}`;

  // Try a small window of offsets (CET=+01, CEST=+02). The correct one renders
  // back to `target` in Europe/Bratislava.
  for (const offsetMin of [-60, -120, 0, 60, 120]) {
    const utcMs = Date.UTC(y, mo - 1, d, hh, mm) - offsetMin * 60 * 1000;
    const cand = new Date(utcMs);
    if (bratislavaHHMM(cand) === target && bratislavaDateKey(cand) === dateKey) {
      return cand;
    }
  }
  // Fallback (should be unreachable for valid SK dates).
  return new Date(Date.UTC(y, mo - 1, d, hh, mm));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
