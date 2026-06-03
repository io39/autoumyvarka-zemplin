import { describe, it, expect } from "vitest";
import { formatCarLabel } from "@/lib/cars/format";

describe("formatCarLabel", () => {
  it("combines brand + model", () => {
    expect(formatCarLabel("Škoda", "Octavia")).toBe("Škoda Octavia");
  });

  it("falls back to whichever side is present", () => {
    expect(formatCarLabel("Škoda", null)).toBe("Škoda");
    expect(formatCarLabel(null, "Octavia")).toBe("Octavia");
    expect(formatCarLabel(undefined, undefined)).toBe("");
    expect(formatCarLabel("", "")).toBe("");
  });

  it("trims and ignores whitespace-only sides", () => {
    expect(formatCarLabel("  Škoda  ", "  Octavia ")).toBe("Škoda Octavia");
    expect(formatCarLabel("   ", "Octavia")).toBe("Octavia");
  });
});
