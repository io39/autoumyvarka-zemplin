import { describe, expect, it } from "vitest";
import {
  formatPriceCents,
  formatDurationMin,
  parseEurosToCents,
  formatCentsForInput,
} from "@/lib/services/format";

describe("formatPriceCents", () => {
  it("renders 1890 cents as '18,90 €' (Slovak locale)", () => {
    // sk-SK uses comma decimal and a non-breaking space before the currency.
    expect(formatPriceCents(1890).replace(/\s/g, " ")).toBe("18,90 €");
  });

  it("renders zero cents as '0,00 €'", () => {
    expect(formatPriceCents(0).replace(/\s/g, " ")).toBe("0,00 €");
  });

  it("prepends 'od' when price_from is true", () => {
    expect(formatPriceCents(21790, { from: true }).replace(/\s/g, " ")).toBe(
      "od 217,90 €",
    );
  });
});

describe("formatDurationMin", () => {
  it("renders NULL durations as an em-dash", () => {
    expect(formatDurationMin(null)).toBe("—");
  });

  it("renders a positive duration in minutes", () => {
    expect(formatDurationMin(60)).toBe("60 min");
  });
});

describe("parseEurosToCents", () => {
  it("parses integers, dot and comma decimals", () => {
    expect(parseEurosToCents("30")).toBe(3000);
    expect(parseEurosToCents("18.90")).toBe(1890);
    expect(parseEurosToCents("18,90")).toBe(1890);
    expect(parseEurosToCents("18,5")).toBe(1850);
  });

  it("ignores spaces and a € sign", () => {
    expect(parseEurosToCents(" 18,90 € ")).toBe(1890);
  });

  it("accepts 0 (a free wash)", () => {
    expect(parseEurosToCents("0")).toBe(0);
  });

  it("returns null for empty or non-numeric input", () => {
    expect(parseEurosToCents("")).toBeNull();
    expect(parseEurosToCents("abc")).toBeNull();
    expect(parseEurosToCents("-5")).toBeNull();
    expect(parseEurosToCents("18,901")).toBeNull(); // more than 2 decimals
  });
});

describe("formatCentsForInput", () => {
  it("formats cents as a comma-decimal euro string with no symbol", () => {
    expect(formatCentsForInput(1890)).toBe("18,90");
    expect(formatCentsForInput(3000)).toBe("30,00");
    expect(formatCentsForInput(0)).toBe("0,00");
  });
});
