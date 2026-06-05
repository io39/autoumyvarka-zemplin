import { describe, it, expect } from "vitest";
import {
  buildRows,
  diffMinutes,
  formatDMY,
  formatWeekRange,
  skWeekdayShort,
  toMinutes,
  weekDateKeys,
  weekRange,
} from "@/lib/calendar/grid";

describe("formatDMY", () => {
  it("renders a YYYY-MM-DD key as DD.MM.YYYY", () => {
    expect(formatDMY("2026-06-03")).toBe("03.06.2026");
    expect(formatDMY("2026-12-31")).toBe("31.12.2026");
  });
});

describe("skWeekdayShort", () => {
  it("returns the Slovak short weekday with a trailing dot", () => {
    // 2026-06-01 is a Monday.
    expect(skWeekdayShort("2026-06-01")).toBe("Po.");
    expect(skWeekdayShort("2026-06-04")).toBe("Št."); // Thursday
    expect(skWeekdayShort("2026-06-07")).toBe("Ne."); // Sunday
  });
});

describe("formatWeekRange", () => {
  it("collapses the shared month+year", () => {
    expect(formatWeekRange("2026-06-01", "2026-06-07")).toBe("01 – 07.06.2026");
  });

  it("keeps both months when the week crosses a month boundary", () => {
    expect(formatWeekRange("2026-06-29", "2026-07-05")).toBe("29.06 – 05.07.2026");
  });

  it("shows full both ends across a year boundary", () => {
    expect(formatWeekRange("2025-12-29", "2026-01-04")).toBe("29.12.2025 – 04.01.2026");
  });
});

describe("calendar grid math (spec 14)", () => {
  it("buildRows yields 15-min HH:MM rows, open inclusive / close exclusive", () => {
    expect(buildRows("08:00", "09:00")).toEqual(["08:00", "08:15", "08:30", "08:45"]);
    expect(buildRows("08:00", "08:00")).toEqual([]);
  });

  it("toMinutes / diffMinutes", () => {
    expect(toMinutes("08:30")).toBe(510);
    expect(diffMinutes("08:00", "09:15")).toBe(75);
    expect(diffMinutes("09:00", "08:00")).toBe(-60);
  });

  it("weekDateKeys returns Monday-first 7 keys for the containing week", () => {
    // 2026-06-03 is a Wednesday.
    expect(weekDateKeys("2026-06-03")).toEqual([
      "2026-06-01", // Mon
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
      "2026-06-07", // Sun
    ]);
    // A Monday maps to itself as the first key.
    expect(weekDateKeys("2026-06-01")[0]).toBe("2026-06-01");
    // A Sunday is the 7th key, not the start of a new week.
    expect(weekDateKeys("2026-06-07")[0]).toBe("2026-06-01");
  });

  it("weekRange is Monday→Sunday of the containing week", () => {
    expect(weekRange("2026-06-03")).toEqual({ from: "2026-06-01", to: "2026-06-07" });
  });
});
