import { describe, it, expect } from "vitest";
import { formatCarLabel, formatCarPrimary, NO_SPZ_LABEL } from "@/lib/cars/format";

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

describe("formatCarPrimary", () => {
  it("uses the ŠPZ when present", () => {
    expect(formatCarPrimary({ spz: "BV123AB", brand: "Škoda", model: "Octavia" })).toBe("BV123AB");
  });

  it("falls back to brand/model for a plateless car", () => {
    expect(formatCarPrimary({ spz: null, brand: "Škoda", model: "Octavia" })).toBe("Škoda Octavia");
    expect(formatCarPrimary({ spz: null, brand: "Audi", model: null })).toBe("Audi");
  });

  it("falls back to 'Bez ŠPZ' only when nothing identifies the car", () => {
    expect(formatCarPrimary({ spz: null, brand: null, model: null })).toBe(NO_SPZ_LABEL);
    expect(formatCarPrimary({ spz: null })).toBe(NO_SPZ_LABEL);
  });
});
