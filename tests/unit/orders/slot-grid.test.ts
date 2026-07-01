import { describe, it, expect } from "vitest";
import {
  computeFreeZones,
  earliestStartToday,
  fitsAt,
  hhmmToMin,
  minToHHMM,
  nearestFreeStarts,
  offsetToStartMin,
  unionSlotRange,
  validStarts,
  type BusyInterval,
} from "@/lib/orders/slot-grid";

const OPEN = hhmmToMin("08:00"); // 480
const CLOSE = hhmmToMin("17:00"); // 1020

// Two bookings: 09:00–10:00 and 13:00–13:30.
const busy: BusyInterval[] = [
  { startMin: hhmmToMin("09:00"), endMin: hhmmToMin("10:00") },
  { startMin: hhmmToMin("13:00"), endMin: hhmmToMin("13:30") },
];

describe("slot-grid math (interactive picker)", () => {
  it("hhmm <-> min round-trips", () => {
    expect(hhmmToMin("08:30")).toBe(510);
    expect(minToHHMM(510)).toBe("08:30");
    expect(minToHHMM(0)).toBe("00:00");
  });

  it("computeFreeZones returns the gaps between bookings within open hours", () => {
    expect(computeFreeZones(OPEN, CLOSE, busy)).toEqual([
      { startMin: hhmmToMin("08:00"), endMin: hhmmToMin("09:00") },
      { startMin: hhmmToMin("10:00"), endMin: hhmmToMin("13:00") },
      { startMin: hhmmToMin("13:30"), endMin: hhmmToMin("17:00") },
    ]);
  });

  it("computeFreeZones with no bookings is the whole open window", () => {
    expect(computeFreeZones(OPEN, CLOSE, [])).toEqual([{ startMin: OPEN, endMin: CLOSE }]);
  });

  it("fitsAt rejects overlap, past-close, and pre-open", () => {
    expect(fitsAt(hhmmToMin("10:00"), 60, OPEN, CLOSE, busy)).toBe(true); // 10:00–11:00 free
    expect(fitsAt(hhmmToMin("09:30"), 30, OPEN, CLOSE, busy)).toBe(false); // overlaps 09:00–10:00
    expect(fitsAt(hhmmToMin("12:45"), 30, OPEN, CLOSE, busy)).toBe(false); // 12:45–13:15 overlaps 13:00
    expect(fitsAt(hhmmToMin("16:45"), 30, OPEN, CLOSE, busy)).toBe(false); // spills past 17:00
    expect(fitsAt(hhmmToMin("16:30"), 30, OPEN, CLOSE, busy)).toBe(true); // 16:30–17:00 ok
    expect(fitsAt(hhmmToMin("07:45"), 30, OPEN, CLOSE, busy)).toBe(false); // before open
  });

  it("validStarts enumerates only fitting 15-min starts", () => {
    const starts = validStarts(OPEN, CLOSE, 60, busy).map(minToHHMM);
    expect(starts).toContain("08:00");
    expect(starts).not.toContain("08:15"); // 08:15–09:15 overlaps 09:00
    expect(starts).toContain("10:00");
    expect(starts).not.toContain("12:30"); // 12:30–13:30 overlaps 13:00
    expect(starts).toContain("16:00"); // 16:00–17:00 last fit
    expect(starts).not.toContain("16:15");
  });

  it("nearestFreeStarts respects the from-cutoff and limit", () => {
    const near = nearestFreeStarts(OPEN, CLOSE, 60, busy, hhmmToMin("11:00"), 2).map(minToHHMM);
    expect(near).toEqual(["11:00", "11:15"]);
  });

  it("earliestStartToday keeps the current slot open and closes fully-past ones", () => {
    expect(minToHHMM(earliestStartToday(hhmmToMin("11:05")))).toBe("11:00"); // mid-slot stays open
    expect(minToHHMM(earliestStartToday(hhmmToMin("13:16")))).toBe("13:15"); // 13:00 closed, 13:15 open
    expect(minToHHMM(earliestStartToday(hhmmToMin("13:00")))).toBe("13:00"); // exactly on the boundary
    expect(minToHHMM(earliestStartToday(hhmmToMin("13:14")))).toBe("13:00"); // still in the 13:00 slot
  });

  it("unionSlotRange snaps an off-grid out-of-hours booking so the axis origin stays on the quarter-hour", () => {
    const fallback = { startMin: hhmmToMin("08:00"), endMin: hhmmToMin("17:00") };
    // An out-of-hours booking at 07:39–08:09 (created before hours were narrowed)
    // must NOT drag the grid origin to 07:39 — that would offset every clicked
    // start by 9 min and the "must be on the quarter-hour" check would reject it.
    const r = unionSlotRange(
      [{ startMin: hhmmToMin("08:00"), endMin: hhmmToMin("17:00") }],
      [{ startMin: hhmmToMin("07:39"), endMin: hhmmToMin("08:09") }],
      fallback,
    );
    expect(r.startMin % 15).toBe(0);
    expect(r.endMin % 15).toBe(0);
    expect(minToHHMM(r.startMin)).toBe("07:30"); // floored to cover 07:39
    expect(minToHHMM(r.endMin)).toBe("17:00");
  });

  it("unionSlotRange falls back when there are no intervals or blocks", () => {
    const fallback = { startMin: hhmmToMin("08:00"), endMin: hhmmToMin("17:00") };
    expect(unionSlotRange([], [], fallback)).toEqual(fallback);
  });

  it("offsetToStartMin snaps a pixel offset to a 15-min start", () => {
    const ROW = 24; // px per 15 min
    expect(offsetToStartMin(0, OPEN, ROW)).toBe(OPEN);
    expect(offsetToStartMin(23, OPEN, ROW)).toBe(OPEN); // within first row
    expect(offsetToStartMin(24, OPEN, ROW)).toBe(OPEN + 15);
    expect(offsetToStartMin(50, OPEN, ROW)).toBe(OPEN + 30);
  });
});
