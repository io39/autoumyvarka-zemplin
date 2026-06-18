import { describe, it, expect } from "vitest";
import { isOutsideHours, type OutsideHoursInput } from "@/lib/orders/out-of-hours";
import type { OpeningHoursRow, DayOverrideRow } from "@/lib/supabase/types";

// Mon–Fri 08:00–17:00, Sat 08:00–12:00, Sun closed (matches seed).
const HOURS: OpeningHoursRow[] = [
  { day_of_week: 0, is_closed: false, open_time: "08:00:00", close_time: "17:00:00" },
  { day_of_week: 1, is_closed: false, open_time: "08:00:00", close_time: "17:00:00" },
  { day_of_week: 2, is_closed: false, open_time: "08:00:00", close_time: "17:00:00" },
  { day_of_week: 3, is_closed: false, open_time: "08:00:00", close_time: "17:00:00" },
  { day_of_week: 4, is_closed: false, open_time: "08:00:00", close_time: "17:00:00" },
  { day_of_week: 5, is_closed: false, open_time: "08:00:00", close_time: "12:00:00" },
  { day_of_week: 6, is_closed: true, open_time: null, close_time: null },
] as OpeningHoursRow[];
const NO_OVERRIDES: DayOverrideRow[] = [];
const TODAY = "2030-01-07"; // a Monday

function order(start: string, end: string, over: Partial<OutsideHoursInput> = {}): OutsideHoursInput {
  return {
    starts_at: `${start}+01:00`,
    ends_at: `${end}+01:00`,
    status: "vytvorena",
    deleted_at: null,
    ...over,
  };
}

describe("isOutsideHours", () => {
  it("false for an upcoming order that fits the day's hours", () => {
    expect(isOutsideHours(order("2030-01-09T09:00:00", "2030-01-09T10:00:00"), HOURS, NO_OVERRIDES, TODAY)).toBe(false);
  });
  it("true for an upcoming order before open", () => {
    expect(isOutsideHours(order("2030-01-09T06:00:00", "2030-01-09T07:00:00"), HOURS, NO_OVERRIDES, TODAY)).toBe(true);
  });
  it("true for an upcoming order after close", () => {
    expect(isOutsideHours(order("2030-01-09T18:00:00", "2030-01-09T19:00:00"), HOURS, NO_OVERRIDES, TODAY)).toBe(true);
  });
  it("true when the day is closed (Sunday)", () => {
    // 2030-01-13 is a Sunday.
    expect(isOutsideHours(order("2030-01-13T09:00:00", "2030-01-13T10:00:00"), HOURS, NO_OVERRIDES, TODAY)).toBe(true);
  });
  it("true when a day_override closes that date", () => {
    const ov: DayOverrideRow[] = [
      { day: "2030-01-09", is_closed: true, open_time: null, close_time: null, label: null } as DayOverrideRow,
    ];
    expect(isOutsideHours(order("2030-01-09T09:00:00", "2030-01-09T10:00:00"), HOURS, ov, TODAY)).toBe(true);
  });
  it("false for a past order even if outside hours", () => {
    expect(isOutsideHours(order("2030-01-05T06:00:00", "2030-01-05T07:00:00"), HOURS, NO_OVERRIDES, TODAY)).toBe(false);
  });
  it("false for non-vytvorená status", () => {
    expect(isOutsideHours(order("2030-01-09T18:00:00", "2030-01-09T19:00:00", { status: "hotova" }), HOURS, NO_OVERRIDES, TODAY)).toBe(false);
  });
  it("false for a soft-deleted order", () => {
    expect(isOutsideHours(order("2030-01-09T18:00:00", "2030-01-09T19:00:00", { deleted_at: "2030-01-08T00:00:00Z" }), HOURS, NO_OVERRIDES, TODAY)).toBe(false);
  });
});
