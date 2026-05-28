import { describe, expect, it } from "vitest";
import { resolveServicePrice } from "@/lib/services/price-lookup";
import type { ServicePriceRow } from "@/lib/supabase/types";

function priceRow(
  pricing_category: ServicePriceRow["pricing_category"],
  price_cents: number,
  duration_min: number | null,
  price_from = false,
): ServicePriceRow {
  return {
    id: `id-${pricing_category ?? "flat"}-${price_cents}`,
    service_id: "svc",
    pricing_category,
    duration_min,
    price_cents,
    price_from,
  };
}

describe("resolveServicePrice", () => {
  it("returns the exact-category row for a main service", () => {
    const rows = [
      priceRow("os", 1890, 60),
      priceRow("suv", 2390, 60),
      priceRow("van", 3190, 75),
    ];
    const r = resolveServicePrice(rows, "suv");
    expect(r).toEqual({ ok: true, durationMin: 60, priceCents: 2390, priceFrom: false });
  });

  it("falls back to the NULL row for a flat add-on", () => {
    const rows = [priceRow(null, 1500, 15)];
    const r = resolveServicePrice(rows, "os");
    expect(r).toEqual({ ok: true, durationMin: 15, priceCents: 1500, priceFrom: false });
  });

  it("returns a not-available error when the category has no row and no flat row exists", () => {
    const rows = [priceRow("os", 1890, 60), priceRow("suv", 2390, 60)];
    const r = resolveServicePrice(rows, "stavba");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/nie je dostupná/i);
  });

  it("preserves price_from on the resolved row (Stavba 'od …')", () => {
    const rows = [priceRow("stavba", 21790, 600, true)];
    const r = resolveServicePrice(rows, "stavba");
    expect(r).toMatchObject({ ok: true, priceCents: 21790, priceFrom: true });
  });

  it("preserves NULL duration (no scheduled time, e.g. dezinfekcia ozónom)", () => {
    const rows = [priceRow(null, 2000, null)];
    const r = resolveServicePrice(rows, "os");
    expect(r).toMatchObject({ ok: true, durationMin: null, priceCents: 2000 });
  });
});
