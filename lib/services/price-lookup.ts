import type { PricingCategory, ServicePriceRow } from "@/lib/supabase/types";

export type ServicePriceLookup =
  | { ok: true; durationMin: number | null; priceCents: number; priceFrom: boolean }
  | { ok: false; message: string };

/**
 * Pure resolver (DB-free, testable): pick the exact-category row; else the
 * NULL-category row (flat add-on); else a "not available for this category"
 * error — the booking flow uses the latter to hide the service rather than
 * show a wrong price.
 */
export function resolveServicePrice(
  prices: ServicePriceRow[],
  category: PricingCategory,
): ServicePriceLookup {
  const exact = prices.find((p) => p.pricing_category === category);
  if (exact) {
    return {
      ok: true,
      durationMin: exact.duration_min,
      priceCents: exact.price_cents,
      priceFrom: exact.price_from,
    };
  }
  const flat = prices.find((p) => p.pricing_category === null);
  if (flat) {
    return {
      ok: true,
      durationMin: flat.duration_min,
      priceCents: flat.price_cents,
      priceFrom: flat.price_from,
    };
  }
  return { ok: false, message: "Služba nie je dostupná pre tento typ vozidla." };
}
