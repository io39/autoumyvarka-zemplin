import { describe, it, expect } from "vitest";
import {
  computeFreeZones,
  earliestStartToday,
  fitsAt,
  hhmmToMin,
  minToHHMM,
  nearestFreeStarts,
  offsetToStartMin,
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

  it("earliestStartToday closes the slot the clock is currently in", () => {
    expect(minToHHMM(earliestStartToday(hhmmToMin("13:16")))).toBe("13:30"); // mid-slot
    expect(minToHHMM(earliestStartToday(hhmmToMin("13:00")))).toBe("13:15"); // on the boundary → next
    expect(minToHHMM(earliestStartToday(hhmmToMin("13:14")))).toBe("13:15"); // just before next boundary
    expect(minToHHMM(earliestStartToday(hhmmToMin("08:01")))).toBe("08:15");
  });

  it("offsetToStartMin snaps a pixel offset to a 15-min start", () => {
    const ROW = 24; // px per 15 min
    expect(offsetToStartMin(0, OPEN, ROW)).toBe(OPEN);
    expect(offsetToStartMin(23, OPEN, ROW)).toBe(OPEN); // within first row
    expect(offsetToStartMin(24, OPEN, ROW)).toBe(OPEN + 15);
    expect(offsetToStartMin(50, OPEN, ROW)).toBe(OPEN + 30);
  });
});
