import type { PricingCategory, ServicePriceRow } from "@/lib/supabase/types";
import { resolveServicePrice } from "@/lib/services/price-lookup";

export interface SelectedService {
  serviceId: string;
  quantity?: number;
}

export interface ResolvedLine {
  serviceId: string;
  quantity: number;
  durationMin: number; // NULL durations contribute 0
  priceCents: number;
  priceFrom: boolean;
  /** The (service × category) row used; null when the service isn't available. */
  source: ServicePriceRow | null;
}

/**
 * Resolve each selected service against its (service × car category) row
 * (spec 03), applying quantity. NULL-duration add-ons contribute 0 minutes;
 * `unavailable` collects services whose category isn't priced — the booking
 * action rejects with a Slovak message before any DB write.
 */
export function resolveOrderLines(
  selections: SelectedService[],
  category: PricingCategory,
  pricesByService: Map<string, ServicePriceRow[]>,
): { lines: ResolvedLine[]; unavailable: string[] } {
  const lines: ResolvedLine[] = [];
  const unavailable: string[] = [];

  for (const sel of selections) {
    const quantity = sel.quantity ?? 1;
    const prices = pricesByService.get(sel.serviceId) ?? [];
    const r = resolveServicePrice(prices, category);
    if (!r.ok) {
      unavailable.push(sel.serviceId);
      continue;
    }
    const exact = prices.find((p) => p.pricing_category === category);
    const flat = prices.find((p) => p.pricing_category === null);
    const source = exact ?? flat ?? null;
    lines.push({
      serviceId: sel.serviceId,
      quantity,
      durationMin: (r.durationMin ?? 0) * quantity,
      priceCents: r.priceCents * quantity,
      priceFrom: r.priceFrom,
      source,
    });
  }

  return { lines, unavailable };
}

/** Σ duration_min over resolved lines. NULL-duration items contribute 0. */
export function totalDurationMin(lines: ResolvedLine[]): number {
  return lines.reduce((acc, l) => acc + l.durationMin, 0);
}

/** Σ price_cents over resolved lines. */
export function totalPriceCents(lines: ResolvedLine[]): number {
  return lines.reduce((acc, l) => acc + l.priceCents, 0);
}
