import { weekDateKeys } from "./grid";
import type { CalendarView } from "./types";

/**
 * "Today" helpers for the calendar (UI redesign spec 14 §2.3). Pure — `now` is
 * passed in so they're unit-testable — and Bratislava-local, matching how the
 * rest of the app keys days.
 */

/** Bratislava-local "YYYY-MM-DD" for the given instant. */
export function todayKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(now);
}

export function isToday(dateKey: string, now: Date): boolean {
  return dateKey === todayKey(now);
}

/**
 * Does the current view already cover today? Day view: the date is today. Week
 * view: today falls within the Monday-anchored week of `dateKey`. Drives the
 * `DNES` pill vs. the `Späť na dnes` button.
 */
export function viewCoversToday(view: CalendarView, dateKey: string, now: Date): boolean {
  const tk = todayKey(now);
  if (view === "week") return weekDateKeys(dateKey).includes(tk);
  return dateKey === tk;
}
