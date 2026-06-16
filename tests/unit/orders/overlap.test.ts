import { describe, it, expect } from "vitest";
import {
  rangesOverlap,
  selectOverlapping,
  type OverlapCandidate,
} from "@/lib/orders/overlap";

describe("rangesOverlap (half-open)", () => {
  it("true when ranges intersect", () => {
    expect(rangesOverlap(0, 60, 30, 90)).toBe(true);
    expect(rangesOverlap(30, 90, 0, 60)).toBe(true);
    expect(rangesOverlap(0, 120, 30, 60)).toBe(true); // contained
  });

  it("false when only touching at an endpoint (half-open)", () => {
    expect(rangesOverlap(0, 60, 60, 120)).toBe(false); // 60 end == 60 start
    expect(rangesOverlap(60, 120, 0, 60)).toBe(false);
  });

  it("false when disjoint", () => {
    expect(rangesOverlap(0, 60, 90, 120)).toBe(false);
  });
});

describe("selectOverlapping", () => {
  const cand = (p: Partial<OverlapCandidate> & { id: string }): OverlapCandidate => ({
    box: 1,
    startMs: 0,
    endMs: 60,
    deleted: false,
    noShow: false,
    ...p,
  });

  it("returns candidates overlapping the range", () => {
    const got = selectOverlapping(
      [cand({ id: "a", startMs: 30, endMs: 90 }), cand({ id: "b", startMs: 200, endMs: 260 })],
      0,
      60,
    );
    expect(got.map((c) => c.id)).toEqual(["a"]);
  });

  it("excludes the order itself (edit/move)", () => {
    const got = selectOverlapping([cand({ id: "self", startMs: 0, endMs: 60 })], 0, 60, "self");
    expect(got).toHaveLength(0);
  });

  it("ignores soft-deleted and no-show orders (they free the slot)", () => {
    const got = selectOverlapping(
      [
        cand({ id: "del", deleted: true }),
        cand({ id: "noshow", noShow: true }),
        cand({ id: "live" }),
      ],
      0,
      60,
    );
    expect(got.map((c) => c.id)).toEqual(["live"]);
  });

  it("a touching-but-not-overlapping neighbour is not a conflict", () => {
    const got = selectOverlapping([cand({ id: "next", startMs: 60, endMs: 120 })], 0, 60);
    expect(got).toHaveLength(0);
  });
});
