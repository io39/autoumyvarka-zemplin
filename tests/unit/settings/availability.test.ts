import { describe, expect, it } from "vitest";
import {
  getOpenInterval,
  isOpenAt,
  isRangeOpen,
  bratislavaDayOfWeek,
  bratislavaDateDisplay,
} from "@/lib/settings/availability";
import type { OpeningHoursRow, DayOverrideRow } from "@/lib/supabase/types";

describe("bratislavaDateDisplay", () => {
  it("formats a UTC instant as DD.MM.YYYY in Bratislava local time", () => {
    // 21:30 UTC in winter (UTC+1) is 22:30 local on the same day.
    expect(bratislavaDateDisplay(new Date("2026-12-24T21:30:00Z"))).toBe("24.12.2026");
    // 23:30 UTC in summer (UTC+2) is 01:30 local the NEXT day.
    expect(bratislavaDateDisplay(new Date("2026-05-25T23:30:00Z"))).toBe("26.05.2026");
  });
});

/**
 * Bratislava is UTC+1 in winter / UTC+2 (DST) in summer. All test datetimes
 * are constructed in UTC and the helper converts; this keeps the suite
 * deterministic across machines.
 *
 * Reference dates:
 *   2026-05-26 — Tuesday (Bratislava local) → DST, UTC+2.
 *   2026-05-25 — Monday (Bratislava local).
 *   2026-12-24 — Thursday (Bratislava local) → no DST, UTC+1.
 */

function hours(rows: Partial<OpeningHoursRow>[]): OpeningHoursRow[] {
  return Array.from({ length: 7 }, (_, dow) => {
    const r = rows.find((x) => x.day_of_week === dow);
    return {
      day_of_week: dow,
      open_time: r?.open_time ?? null,
      close_time: r?.close_time ?? null,
      is_closed: r?.is_closed ?? true,
    } as OpeningHoursRow;
  });
}

function override(row: Partial<DayOverrideRow> & { day: string }): DayOverrideRow {
  return {
    day: row.day,
    is_closed: row.is_closed ?? true,
    open_time: row.open_time ?? null,
    close_time: row.close_time ?? null,
    label: row.label ?? null,
  };
}

const STANDARD_HOURS = hours([
  { day_of_week: 0, open_time: "08:00:00", close_time: "17:00:00", is_closed: false },
  { day_of_week: 1, open_time: "08:00:00", close_time: "17:00:00", is_closed: false },
  { day_of_week: 2, open_time: "08:00:00", close_time: "17:00:00", is_closed: false },
  { day_of_week: 3, open_time: "08:00:00", close_time: "17:00:00", is_closed: false },
  { day_of_week: 4, open_time: "08:00:00", close_time: "17:00:00", is_closed: false },
  { day_of_week: 5, open_time: "08:00:00", close_time: "12:00:00", is_closed: false },
  { day_of_week: 6, is_closed: true },
]);

describe("bratislavaDayOfWeek", () => {
  it("returns 0 for Monday (Bratislava)", () => {
    // 2026-05-25 is a Monday in Bratislava.
    expect(bratislavaDayOfWeek(new Date("2026-05-25T10:00:00Z"))).toBe(0);
  });

  it("returns 6 for Sunday", () => {
    // 2026-05-24 is a Sunday in Bratislava.
    expect(bratislavaDayOfWeek(new Date("2026-05-24T10:00:00Z"))).toBe(6);
  });
});

describe("getOpenInterval", () => {
  it("returns the weekday interval when no override", () => {
    // 2026-05-26 is a Tuesday (dow=1).
    const r = getOpenInterval(new Date("2026-05-26T10:00:00Z"), STANDARD_HOURS, []);
    expect(r).toEqual({ open: "08:00", close: "17:00" });
  });

  it("returns null on a weekday marked closed", () => {
    // Sunday (dow=6) is closed in STANDARD_HOURS.
    expect(getOpenInterval(new Date("2026-05-24T10:00:00Z"), STANDARD_HOURS, [])).toBe(null);
  });

  it("returns null when an override marks the date closed (even on an open weekday)", () => {
    const o = [override({ day: "2026-05-26", is_closed: true, label: "Sviatok" })];
    expect(getOpenInterval(new Date("2026-05-26T10:00:00Z"), STANDARD_HOURS, o)).toBe(null);
  });

  it("uses the override's custom hours (not the weekday) when present", () => {
    const o = [
      override({
        day: "2026-12-24",
        is_closed: false,
        open_time: "08:00:00",
        close_time: "12:00:00",
        label: "Štedrý deň",
      }),
    ];
    const r = getOpenInterval(new Date("2026-12-24T10:00:00Z"), STANDARD_HOURS, o);
    expect(r).toEqual({ open: "08:00", close: "12:00" });
  });
});

describe("isOpenAt", () => {
  // 2026-05-26 10:00 Bratislava = 08:00 UTC (DST, UTC+2).
  it("returns true inside the open window", () => {
    expect(isOpenAt(new Date("2026-05-26T08:00:00Z"), STANDARD_HOURS, [])).toBe(true);
  });

  it("returns false before open", () => {
    // 07:59 Bratislava = 05:59 UTC.
    expect(isOpenAt(new Date("2026-05-26T05:59:00Z"), STANDARD_HOURS, [])).toBe(false);
  });

  it("returns false at exactly close_time (close is exclusive)", () => {
    // 17:00 Bratislava = 15:00 UTC.
    expect(isOpenAt(new Date("2026-05-26T15:00:00Z"), STANDARD_HOURS, [])).toBe(false);
  });

  it("returns false on a closed override even on an open weekday", () => {
    const o = [override({ day: "2026-05-26", is_closed: true })];
    expect(isOpenAt(new Date("2026-05-26T08:00:00Z"), STANDARD_HOURS, o)).toBe(false);
  });

  it("uses override custom hours (true inside, false outside)", () => {
    // 2026-12-24 (Štedrý deň) open 08:00–12:00; standard Thursday is 08:00–17:00.
    const o = [
      override({
        day: "2026-12-24",
        is_closed: false,
        open_time: "08:00:00",
        close_time: "12:00:00",
      }),
    ];
    // 11:59 Bratislava = 10:59 UTC (winter, UTC+1).
    expect(isOpenAt(new Date("2026-12-24T10:59:00Z"), STANDARD_HOURS, o)).toBe(true);
    // 12:00 Bratislava = 11:00 UTC — past override close.
    expect(isOpenAt(new Date("2026-12-24T11:00:00Z"), STANDARD_HOURS, o)).toBe(false);
  });
});

describe("isRangeOpen", () => {
  // Tuesday 09:00–10:00 Bratislava (DST) → 07:00–08:00 UTC.
  const start = new Date("2026-05-26T07:00:00Z");
  const end = new Date("2026-05-26T08:00:00Z");

  it("true when start and end lie inside the open interval", () => {
    expect(isRangeOpen(start, end, STANDARD_HOURS, [])).toBe(true);
  });

  it("false when end extends past close", () => {
    // 16:00–17:30 Bratislava → 14:00–15:30 UTC. close is 17:00.
    const s = new Date("2026-05-26T14:00:00Z");
    const e = new Date("2026-05-26T15:30:00Z");
    expect(isRangeOpen(s, e, STANDARD_HOURS, [])).toBe(false);
  });

  it("false when the range falls on a closed-override date", () => {
    const o = [override({ day: "2026-05-26", is_closed: true })];
    expect(isRangeOpen(start, end, STANDARD_HOURS, o)).toBe(false);
  });

  it("false when the range spans midnight (two local dates)", () => {
    // 23:30 Mon → 00:30 Tue Bratislava (DST) → 21:30 UTC → 22:30 UTC.
    const s = new Date("2026-05-25T21:30:00Z");
    const e = new Date("2026-05-25T22:30:00Z");
    expect(isRangeOpen(s, e, STANDARD_HOURS, [])).toBe(false);
  });

  it("false when start equals end (zero-length range)", () => {
    expect(isRangeOpen(start, start, STANDARD_HOURS, [])).toBe(false);
  });
});
