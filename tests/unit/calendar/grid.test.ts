import { describe, it, expect } from "vitest";
import {
  buildRows,
  diffMinutes,
  toMinutes,
  weekDateKeys,
  weekRange,
} from "@/lib/calendar/grid";

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
