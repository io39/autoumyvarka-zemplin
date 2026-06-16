import { describe, it, expect } from "vitest";
import { assignLanes } from "@/lib/calendar/lanes";

const item = (id: string, startMin: number, endMin: number) => ({ id, startMin, endMin });

/** Convenience: map result to `id -> "lane/lanes"`. */
function plan(items: ReturnType<typeof item>[]) {
  return Object.fromEntries(assignLanes(items).map((r) => [r.id, `${r.lane}/${r.lanes}`]));
}

describe("assignLanes", () => {
  it("a lone booking takes the full width (one lane)", () => {
    expect(plan([item("a", 0, 60)])).toEqual({ a: "0/1" });
  });

  it("two overlapping bookings split into halves", () => {
    expect(plan([item("a", 0, 60), item("b", 30, 90)])).toEqual({ a: "0/2", b: "1/2" });
  });

  it("three overlapping bookings split into thirds", () => {
    expect(plan([item("a", 0, 90), item("b", 10, 80), item("c", 20, 70)])).toEqual({
      a: "0/3",
      b: "1/3",
      c: "2/3",
    });
  });

  it("separate (non-overlapping) bookings are each full width", () => {
    expect(plan([item("a", 0, 60), item("b", 120, 180)])).toEqual({ a: "0/1", b: "0/1" });
  });

  it("two clusters are independent", () => {
    // morning pair overlaps (halves); afternoon trio overlaps (thirds).
    expect(
      plan([
        item("m1", 0, 60),
        item("m2", 30, 90),
        item("a1", 600, 660),
        item("a2", 610, 670),
        item("a3", 620, 680),
      ]),
    ).toEqual({ m1: "0/2", m2: "1/2", a1: "0/3", a2: "1/3", a3: "2/3" });
  });

  it("transitive overlap (chain) joins one cluster, each its own lane", () => {
    // a–b overlap, b–c overlap, a–c do NOT, but all are one connected cluster.
    expect(plan([item("a", 0, 40), item("b", 30, 70), item("c", 60, 100)])).toEqual({
      a: "0/3",
      b: "1/3",
      c: "2/3",
    });
  });

  it("touching at an endpoint is not an overlap (separate lanes/full width)", () => {
    expect(plan([item("a", 0, 60), item("b", 60, 120)])).toEqual({ a: "0/1", b: "0/1" });
  });

  it("preserves input order in the result", () => {
    const res = assignLanes([item("b", 30, 90), item("a", 0, 60)]);
    expect(res.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
