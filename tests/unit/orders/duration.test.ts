import { describe, expect, it } from "vitest";
import {
  resolveOrderLines,
  totalDurationMin,
  totalPriceCents,
} from "@/lib/orders/duration";
import type { ServicePriceRow } from "@/lib/supabase/types";

function row(
  service_id: string,
  pricing_category: ServicePriceRow["pricing_category"],
  duration_min: number | null,
  price_cents: number,
): ServicePriceRow {
  return {
    id: `${service_id}-${pricing_category ?? "flat"}`,
    service_id,
    pricing_category,
    duration_min,
    price_cents,
    price_from: false,
  };
}

describe("resolveOrderLines + totals", () => {
  const prices = new Map<string, ServicePriceRow[]>([
    [
      "int-classic",
      [
        row("int-classic", "os", 60, 1890),
        row("int-classic", "suv", 60, 2390),
      ],
    ],
    [
      "tepovanie-sedadla",
      [row("tepovanie-sedadla", null, 15, 1500)],
    ],
    [
      "dezinfekcia",
      [row("dezinfekcia", null, null, 2000)],
    ],
    [
      "ochrana-mm1",
      [row("ochrana-mm1", "os", 75, 5790)],
    ],
  ]);

  it("sums per-category durations and prices", () => {
    const { lines, unavailable } = resolveOrderLines(
      [{ serviceId: "int-classic" }, { serviceId: "tepovanie-sedadla", quantity: 2 }],
      "os",
      prices,
    );
    expect(unavailable).toHaveLength(0);
    expect(totalDurationMin(lines)).toBe(60 + 2 * 15);
    expect(totalPriceCents(lines)).toBe(1890 + 2 * 1500);
  });

  it("uses the right category row for SUV", () => {
    const { lines } = resolveOrderLines([{ serviceId: "int-classic" }], "suv", prices);
    expect(lines[0].priceCents).toBe(2390);
  });

  it("NULL-duration add-on contributes 0 minutes", () => {
    const { lines } = resolveOrderLines(
      [{ serviceId: "int-classic" }, { serviceId: "dezinfekcia" }],
      "os",
      prices,
    );
    expect(totalDurationMin(lines)).toBe(60);
    expect(totalPriceCents(lines)).toBe(1890 + 2000);
  });

  it("flags an unavailable (service × category) without inserting a line", () => {
    // ochrana-mm1 only has 'os' row; for 'motorka' it's unavailable.
    const { lines, unavailable } = resolveOrderLines(
      [{ serviceId: "ochrana-mm1" }],
      "motorka",
      prices,
    );
    expect(lines).toHaveLength(0);
    expect(unavailable).toEqual(["ochrana-mm1"]);
  });
});
