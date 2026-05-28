import { describe, expect, it } from "vitest";
import {
  saveOpeningHoursSchema,
  upsertDayOverrideSchema,
} from "@/lib/validation/settings";

function row(dow: number, isClosed: boolean, openTime?: string, closeTime?: string) {
  return { dayOfWeek: dow, isClosed, openTime, closeTime };
}

function full7(open: string, close: string) {
  return Array.from({ length: 7 }, (_, dow) => row(dow, false, open, close));
}

describe("saveOpeningHoursSchema", () => {
  it("accepts 7 rows on 15-min boundaries with open < close", () => {
    const parsed = saveOpeningHoursSchema.parse({ rows: full7("08:00", "17:00") });
    expect(parsed.rows).toHaveLength(7);
  });

  it("rejects a non-15-min boundary time", () => {
    const rows = full7("08:00", "17:00");
    rows[0] = row(0, false, "08:07", "17:00");
    expect(() => saveOpeningHoursSchema.parse({ rows })).toThrow();
  });

  it("rejects open >= close on an open day", () => {
    const rows = full7("08:00", "17:00");
    rows[0] = row(0, false, "17:00", "08:00");
    expect(() => saveOpeningHoursSchema.parse({ rows })).toThrow();
  });

  it("accepts an explicit closed day without times", () => {
    const rows = full7("08:00", "17:00");
    rows[6] = row(6, true);
    const parsed = saveOpeningHoursSchema.parse({ rows });
    expect(parsed.rows[6].isClosed).toBe(true);
  });

  it("rejects an open day missing times", () => {
    const rows = full7("08:00", "17:00");
    rows[0] = row(0, false);
    expect(() => saveOpeningHoursSchema.parse({ rows })).toThrow();
  });

  it("rejects fewer than 7 rows", () => {
    expect(() =>
      saveOpeningHoursSchema.parse({ rows: full7("08:00", "17:00").slice(0, 5) }),
    ).toThrow();
  });

  it("rejects a duplicate day_of_week", () => {
    const rows = full7("08:00", "17:00");
    rows[1] = row(0, false, "08:00", "17:00"); // two day_of_week=0 rows
    expect(() => saveOpeningHoursSchema.parse({ rows })).toThrow();
  });
});

describe("upsertDayOverrideSchema", () => {
  it("accepts a closed-day override", () => {
    const parsed = upsertDayOverrideSchema.parse({
      day: "2026-12-24",
      isClosed: true,
      label: "Štedrý deň",
    });
    expect(parsed).toMatchObject({ day: "2026-12-24", isClosed: true });
  });

  it("accepts a custom-hours override on 15-min boundaries", () => {
    const parsed = upsertDayOverrideSchema.parse({
      day: "2026-12-24",
      isClosed: false,
      openTime: "08:00",
      closeTime: "12:00",
    });
    expect(parsed.openTime).toBe("08:00");
  });

  it("rejects a custom-hours override on a non-15-min time", () => {
    expect(() =>
      upsertDayOverrideSchema.parse({
        day: "2026-12-24",
        isClosed: false,
        openTime: "08:07",
        closeTime: "12:00",
      }),
    ).toThrow();
  });

  it("rejects an open override missing times", () => {
    expect(() =>
      upsertDayOverrideSchema.parse({ day: "2026-12-24", isClosed: false }),
    ).toThrow();
  });

  it("rejects an invalid date string", () => {
    expect(() =>
      upsertDayOverrideSchema.parse({ day: "2026/12/24", isClosed: true }),
    ).toThrow();
  });
});
