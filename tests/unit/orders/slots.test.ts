import { describe, expect, it } from "vitest";
import {
  isOn15MinBoundary,
  suggestFreeSlots,
  overlapsAny,
} from "@/lib/orders/slots";
import type { DayOverrideRow, OpeningHoursRow } from "@/lib/supabase/types";

function hours(open: string, close: string): OpeningHoursRow[] {
  return Array.from({ length: 7 }, (_, dow) => ({
    day_of_week: dow,
    open_time: `${open}:00`,
    close_time: `${close}:00`,
    is_closed: false,
  }));
}

function utcAt(dateKey: string, hhmm: string, offsetMin: number): Date {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m) - offsetMin * 60 * 1000);
}

describe("isOn15MinBoundary", () => {
  it("accepts :00 and :15 multiples", () => {
    expect(isOn15MinBoundary(new Date("2026-05-26T08:00:00Z"))).toBe(true);
    expect(isOn15MinBoundary(new Date("2026-05-26T08:15:00Z"))).toBe(true);
    expect(isOn15MinBoundary(new Date("2026-05-26T08:45:00Z"))).toBe(true);
  });

  it("rejects :07 and seconds offsets", () => {
    expect(isOn15MinBoundary(new Date("2026-05-26T08:07:00Z"))).toBe(false);
    expect(isOn15MinBoundary(new Date("2026-05-26T08:00:30Z"))).toBe(false);
  });
});

describe("suggestFreeSlots", () => {
  // 2026-05-26 is a Tuesday in Bratislava → DST (UTC+2).
  // 08:00–17:00 local → 06:00–15:00 UTC.
  const standardHours = hours("08", "17");

  it("returns only 15-min starts that fit duration within open hours", () => {
    const slots = suggestFreeSlots({
      date: new Date("2026-05-26T10:00:00Z"),
      durationMin: 60,
      hours: standardHours,
      overrides: [],
      busy: [],
      boxes: [1],
      limit: 100,
    });
    // From 08:00 to 16:00 = 33 starts (every :00/:15/:30/:45).
    expect(slots).toHaveLength(33);
    expect(slots[0].localStart).toBe("08:00");
    // The last that still finishes by 17:00 is 16:00.
    expect(slots[slots.length - 1].localStart).toBe("16:00");
  });

  it("excludes slots that overlap a busy interval", () => {
    // Busy 09:00–10:00 local in box 1 → blocks any 60-min start that
    // overlaps it (08:15 .. 09:45 inclusive).
    const busyStart = utcAt("2026-05-26", "09:00", 120);
    const busyEnd = utcAt("2026-05-26", "10:00", 120);
    const slots = suggestFreeSlots({
      date: new Date("2026-05-26T10:00:00Z"),
      durationMin: 60,
      hours: standardHours,
      overrides: [],
      busy: [{ box: 1, startsAt: busyStart, endsAt: busyEnd }],
      boxes: [1],
      limit: 100,
    });
    const taken = new Set(slots.map((s) => s.localStart));
    expect(taken.has("08:00")).toBe(true);
    expect(taken.has("08:15")).toBe(false);
    expect(taken.has("09:00")).toBe(false);
    expect(taken.has("09:45")).toBe(false);
    expect(taken.has("10:00")).toBe(true);
  });

  it("returns nothing on a closed-override date", () => {
    const o: DayOverrideRow[] = [
      { day: "2026-05-26", is_closed: true, open_time: null, close_time: null, label: null },
    ];
    const slots = suggestFreeSlots({
      date: new Date("2026-05-26T10:00:00Z"),
      durationMin: 60,
      hours: standardHours,
      overrides: o,
      busy: [],
    });
    expect(slots).toEqual([]);
  });

  it("respects a custom-hours override for short days", () => {
    const o: DayOverrideRow[] = [
      {
        day: "2026-12-24",
        is_closed: false,
        open_time: "08:00:00",
        close_time: "12:00:00",
        label: null,
      },
    ];
    const slots = suggestFreeSlots({
      date: new Date("2026-12-24T10:00:00Z"),
      durationMin: 60,
      hours: standardHours,
      overrides: o,
      busy: [],
      boxes: [1],
      limit: 100,
    });
    // 08:00..11:00 = 13 starts (last fits 11:00-12:00).
    expect(slots[0].localStart).toBe("08:00");
    expect(slots[slots.length - 1].localStart).toBe("11:00");
  });

  it("returns nothing when duration <= 0", () => {
    const slots = suggestFreeSlots({
      date: new Date("2026-05-26T10:00:00Z"),
      durationMin: 0,
      hours: standardHours,
      overrides: [],
      busy: [],
    });
    expect(slots).toEqual([]);
  });
});

describe("overlapsAny", () => {
  it("touching boundaries do not overlap (half-open ranges)", () => {
    const busy = [
      {
        box: 1,
        startsAt: new Date("2026-05-26T08:00:00Z"),
        endsAt: new Date("2026-05-26T09:00:00Z"),
      },
    ];
    expect(
      overlapsAny(
        new Date("2026-05-26T09:00:00Z"),
        new Date("2026-05-26T10:00:00Z"),
        busy,
      ),
    ).toBe(false);
    expect(
      overlapsAny(
        new Date("2026-05-26T08:30:00Z"),
        new Date("2026-05-26T09:30:00Z"),
        busy,
      ),
    ).toBe(true);
  });
});
