import { describe, it, expect } from "vitest";
import {
  addonGroup,
  effectiveTotalCents,
  finishHHMM,
  resolveSelectionLines,
  totalDurationMin,
  totalPriceCents,
} from "@/lib/orders/booking";
import type { ServiceWithPrices } from "@/lib/actions/services";

function svc(id: string, name: string, prices: ServiceWithPrices["prices"]): ServiceWithPrices {
  return {
    service: { id, name, kind: "main", active: true, is_per_unit: false } as ServiceWithPrices["service"],
    prices,
  };
}

const WASH = svc("w", "Umytie", [
  { service_id: "w", pricing_category: "os", price_cents: 1000, price_from: false, duration_min: 30 },
] as ServiceWithPrices["prices"]);

describe("booking wizard math (spec 16)", () => {
  it("resolveSelectionLines multiplies by quantity and honors category", () => {
    const lines = resolveSelectionLines([{ serviceId: "w", quantity: 2 }], [WASH], "os");
    expect(lines).toHaveLength(1);
    expect(lines[0].durationMin).toBe(60);
    expect(lines[0].priceCents).toBe(2000);
    expect(lines[0].unavailable).toBe(false);
  });

  it("flags an unavailable (no price for category) line", () => {
    const lines = resolveSelectionLines([{ serviceId: "w", quantity: 1 }], [WASH], "van");
    expect(lines[0].unavailable).toBe(true);
    expect(lines[0].durationMin).toBe(0);
  });

  it("no category → no lines", () => {
    expect(resolveSelectionLines([{ serviceId: "w", quantity: 1 }], [WASH], null)).toEqual([]);
  });

  it("totalDurationMin sums lines, override wins when positive", () => {
    const lines = resolveSelectionLines([{ serviceId: "w", quantity: 2 }], [WASH], "os");
    expect(totalDurationMin(lines)).toBe(60);
    expect(totalDurationMin(lines, 90)).toBe(90);
    expect(totalDurationMin(lines, 0)).toBe(60);
    expect(totalPriceCents(lines)).toBe(2000);
  });

  it("finishHHMM adds duration and wraps", () => {
    expect(finishHHMM("09:00", 90)).toBe("10:30");
    expect(finishHHMM("23:30", 60)).toBe("00:30");
    expect(finishHHMM("09:00", 0)).toBe("");
  });

  it("effectiveTotalCents: override replaces the line sum, null/undefined falls back", () => {
    expect(effectiveTotalCents(1700, null)).toBe(1700);
    expect(effectiveTotalCents(1700, undefined)).toBe(1700);
    expect(effectiveTotalCents(1700, 2500)).toBe(2500);
    expect(effectiveTotalCents(1700, 0)).toBe(0); // a free wash overrides to 0
  });

  it("addonGroup buckets add-ons by name prefix (with/without diacritics)", () => {
    expect(addonGroup("Tepovanie sedadla")).toBe("tepovanie");
    expect(addonGroup("tepovanie kufra")).toBe("tepovanie");
    expect(addonGroup("Čistenie okien")).toBe("cistenie");
    expect(addonGroup("cistenie motorovej casti")).toBe("cistenie");
    expect(addonGroup("Voskovanie")).toBe("ostatne");
    expect(addonGroup("")).toBe("ostatne");
  });
});
