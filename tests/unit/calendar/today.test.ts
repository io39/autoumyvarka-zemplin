import { describe, it, expect } from "vitest";
import { isToday, todayKey, viewCoversToday } from "@/lib/calendar/today";

// A fixed instant: 2026-06-03 10:00 UTC = 12:00 Bratislava (CEST), still 2026-06-03.
const NOW = new Date("2026-06-03T10:00:00Z");

describe("calendar today helpers (spec 14)", () => {
  it("todayKey is the Bratislava-local day", () => {
    expect(todayKey(NOW)).toBe("2026-06-03");
    // 23:30 UTC on 2026-06-03 is already 01:30 the next day in Bratislava (CEST +02).
    expect(todayKey(new Date("2026-06-03T23:30:00Z"))).toBe("2026-06-04");
  });

  it("isToday compares against the Bratislava day", () => {
    expect(isToday("2026-06-03", NOW)).toBe(true);
    expect(isToday("2026-06-04", NOW)).toBe(false);
  });

  it("viewCoversToday — day view is exact, week view spans the Mon–Sun week", () => {
    expect(viewCoversToday("day", "2026-06-03", NOW)).toBe(true);
    expect(viewCoversToday("day", "2026-06-04", NOW)).toBe(false);

    // The week of 2026-06-01..07 contains today (Wed 2026-06-03).
    expect(viewCoversToday("week", "2026-06-01", NOW)).toBe(true);
    expect(viewCoversToday("week", "2026-06-07", NOW)).toBe(true);
    // The following week does not.
    expect(viewCoversToday("week", "2026-06-08", NOW)).toBe(false);
  });
});
