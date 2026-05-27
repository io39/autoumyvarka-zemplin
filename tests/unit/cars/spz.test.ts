import { describe, expect, it } from "vitest";
import { normalizeSpz } from "@/lib/cars/spz";

describe("normalizeSpz", () => {
  it("converges spacing/case variants to one plate", () => {
    expect(normalizeSpz("BV 123 AB")).toBe("BV123AB");
    expect(normalizeSpz("bv123ab")).toBe("BV123AB");
    expect(normalizeSpz("BV123AB ")).toBe("BV123AB");
    expect(normalizeSpz("bv-123-ab")).toBe("BV123AB");
  });

  it("returns null for implausible input", () => {
    expect(normalizeSpz("")).toBeNull();
    expect(normalizeSpz("AB")).toBeNull(); // too short
    expect(normalizeSpz("BV123@AB")).toBeNull(); // invalid char
  });
});
