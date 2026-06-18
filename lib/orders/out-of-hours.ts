import type { DayOverrideRow, OpeningHoursRow, OrderStatus } from "@/lib/supabase/types";
import { bratislavaDateKey, isRangeOpen } from "@/lib/settings/availability";

/**
 * "Outside opening hours" definition (spec 04/10) — DERIVED, never stored. An
 * order is flagged only when it is still actionable as a future scheduling
 * problem and no longer fits its day's open interval. Reuses `isRangeOpen`, so a
 * change to the hours config (or rescheduling the order) flips this with no
 * stored state to update. Orders are normally born inside hours (createOrder
 * enforces it); this catches the case where a manager narrows/closes hours after
 * the order already exists.
 */
export interface OutsideHoursInput {
  starts_at: string;
  ends_at: string;
  status: OrderStatus;
  deleted_at: string | null;
}

export function isOutsideHours(
  o: OutsideHoursInput,
  hours: OpeningHoursRow[],
  overrides: DayOverrideRow[],
  todayKey: string,
): boolean {
  if (o.deleted_at !== null) return false;
  if (o.status !== "vytvorena") return false; // only upcoming, not-done orders
  // YYYY-MM-DD keys sort lexicographically → a string compare is the date compare.
  if (bratislavaDateKey(new Date(o.starts_at)) < todayKey) return false; // past
  return !isRangeOpen(new Date(o.starts_at), new Date(o.ends_at), hours, overrides);
}
