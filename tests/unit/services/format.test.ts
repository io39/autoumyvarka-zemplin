import { describe, expect, it } from "vitest";
import { formatPriceCents, formatDurationMin } from "@/lib/services/format";

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
