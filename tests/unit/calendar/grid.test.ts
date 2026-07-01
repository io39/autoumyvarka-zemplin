import { describe, it, expect } from "vitest";
import {
  NOTE_BASE_PX,
  NOTE_LINE_PX,
  ROW_PX,
  buildRows,
  ceilTo15,
  computeRowLayout,
  diffMinutes,
  floorTo15,
  formatDMY,
  formatWeekRange,
  noteCardMinPx,
  skWeekdayShort,
  slotAtOffset,
  toMinutes,
  weekDateKeys,
  weekRange,
} from "@/lib/calendar/grid";

describe("floorTo15 / ceilTo15", () => {
  it("leaves a 15-aligned time unchanged", () => {
    expect(floorTo15("06:00")).toBe("06:00");
    expect(ceilTo15("06:00")).toBe("06:00");
    expect(floorTo15("06:45")).toBe("06:45");
  });
  it("rounds down / up to the 15-min grid", () => {
    expect(floorTo15("06:07")).toBe("06:00");
    expect(ceilTo15("06:55")).toBe("07:00");
    expect(floorTo15("18:14")).toBe("18:00");
    expect(ceilTo15("18:01")).toBe("18:15");
  });
});

describe("computeRowLayout", () => {
  it("all rows are ROW_PX when nothing is short", () => {
    // a 60-min booking spans 4 rows (4×20=80 ≥ 42), no growth.
    const { heights, top } = computeRowLayout([{ startMin: 0, endMin: 60 }], 8);
    expect(heights.every((h) => h === ROW_PX)).toBe(true);
    expect(top).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160]);
  });

  it("a 15-min booking grows its single row to MIN_CARD_PX", () => {
    const { heights, top } = computeRowLayout([{ startMin: 0, endMin: 15 }], 4);
    expect(heights[0]).toBe(42); // grew
    expect(heights.slice(1)).toEqual([20, 20, 20]);
    expect(top[1] - top[0]).toBe(42); // the booking's rendered height
  });

  it("back-to-back short bookings each grow their own row", () => {
    const { heights } = computeRowLayout(
      [
        { startMin: 0, endMin: 15 },
        { startMin: 15, endMin: 30 },
      ],
      4,
    );
    expect(heights[0]).toBe(42);
    expect(heights[1]).toBe(42);
    expect(heights[2]).toBe(20);
  });

  it("a per-item minPx (e.g. a card with a note row) grows the row further", () => {
    const { heights } = computeRowLayout([{ startMin: 0, endMin: 15, minPx: 60 }], 4);
    expect(heights[0]).toBe(60); // taller than the default MIN_CARD_PX (42)
  });

  it("a row shared by lanes takes the max growth (not the sum)", () => {
    const { heights } = computeRowLayout(
      [
        { startMin: 0, endMin: 15 },
        { startMin: 0, endMin: 15 }, // same row, another lane
      ],
      2,
    );
    expect(heights[0]).toBe(42); // max, not 42+extra
  });
});

describe("noteCardMinPx", () => {
  it("reserves rows in proportion to the note length, capped at 3 lines", () => {
    expect(noteCardMinPx(0)).toBe(NOTE_BASE_PX + NOTE_LINE_PX); // never 0 lines
    expect(noteCardMinPx(10)).toBe(NOTE_BASE_PX + NOTE_LINE_PX); // short → 1 line
    expect(noteCardMinPx(40)).toBe(NOTE_BASE_PX + 2 * NOTE_LINE_PX); // medium → 2 lines
    expect(noteCardMinPx(200)).toBe(NOTE_BASE_PX + 3 * NOTE_LINE_PX); // long → capped at 3
  });

  it("grows monotonically but never past the 3-line cap", () => {
    const short = noteCardMinPx(5);
    const long = noteCardMinPx(500);
    expect(long).toBeGreaterThan(short);
    expect(long).toBe(NOTE_BASE_PX + 3 * NOTE_LINE_PX);
  });

  it("a per-note line costs less than a full grid row, so a tall-enough booking keeps its rows", () => {
    // A booking already tall enough to hold the note must NOT be stretched: one
    // note line reserves fewer px than a 15-min row (ROW_PX), so its estimated
    // minimum fits inside the booking's own duration height.
    expect(NOTE_LINE_PX).toBeLessThan(ROW_PX);
    // A 5-row booking (75 min → 100px) carrying a max 3-line note does not grow.
    const { heights } = computeRowLayout(
      [{ startMin: 0, endMin: 75, minPx: noteCardMinPx(200) }],
      6,
    );
    expect(heights.slice(0, 5)).toEqual([20, 20, 20, 20, 20]);
    expect(noteCardMinPx(200)).toBeLessThanOrEqual(5 * ROW_PX);
  });

  it("a short booking with a note still grows to fit it", () => {
    // A 15-min booking (1 row → 20px) can't show a 2-line note, so it grows.
    const { top } = computeRowLayout([{ startMin: 0, endMin: 15, minPx: noteCardMinPx(40) }], 4);
    expect(top[1]).toBe(noteCardMinPx(40)); // the single spanned row grew to the note minimum
  });
});

describe("slotAtOffset", () => {
  it("maps a pixel offset to the slot whose band contains it (uniform rows)", () => {
    const top = [0, 20, 40, 60, 80];
    expect(slotAtOffset(top, 0)).toBe(0);
    expect(slotAtOffset(top, 19)).toBe(0);
    expect(slotAtOffset(top, 20)).toBe(1);
    expect(slotAtOffset(top, 75)).toBe(3);
    expect(slotAtOffset(top, 999)).toBe(3); // clamped to last
  });

  it("respects variable row heights (a grown first row)", () => {
    const top = [0, 42, 62, 82]; // first row grown to 42
    expect(slotAtOffset(top, 30)).toBe(0); // still inside the tall first row
    expect(slotAtOffset(top, 42)).toBe(1);
    expect(slotAtOffset(top, 70)).toBe(2);
  });
});

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
