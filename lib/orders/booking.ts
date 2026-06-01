import type { ServiceWithPrices } from "@/lib/actions/services";
import type { PricingCategory } from "@/lib/supabase/types";
import { resolveServicePrice } from "@/lib/services/price-lookup";

/** A chosen service line in the booking wizard. */
export interface Selection {
  serviceId: string;
  quantity: number;
}

export interface ResolvedLine {
  sel: Selection;
  svc: ServiceWithPrices;
  durationMin: number;
  priceCents: number;
  priceFrom: boolean;
  unavailable: boolean;
}

/**
 * Resolve each selection against the car's pricing category — duration and
 * price (×quantity), flagging unavailable combinations. Pure (UI redesign spec
 * 16 §2.4); the booking wizard's Σ-min / Σ-€ summary and slot length derive from
 * this, matching the original BookingForm math.
 */
export function resolveSelectionLines(
  selections: Selection[],
  services: ServiceWithPrices[],
  category: PricingCategory | null,
): ResolvedLine[] {
  if (!category) return [];
  const out: ResolvedLine[] = [];
  for (const sel of selections) {
    const svc = services.find((s) => s.service.id === sel.serviceId);
    if (!svc) continue;
    const r = resolveServicePrice(svc.prices, category);
    if (!r.ok) {
      out.push({ sel, svc, durationMin: 0, priceCents: 0, priceFrom: false, unavailable: true });
      continue;
    }
    out.push({
      sel,
      svc,
      durationMin: (r.durationMin ?? 0) * sel.quantity,
      priceCents: r.priceCents * sel.quantity,
      priceFrom: r.priceFrom,
      unavailable: false,
    });
  }
  return out;
}

/** Σ duration; a positive `overrideMin` wins (manual override). */
export function totalDurationMin(lines: ResolvedLine[], overrideMin?: number): number {
  const sum = lines.reduce((a, l) => a + l.durationMin, 0);
  return overrideMin && Number.isFinite(overrideMin) && overrideMin > 0 ? overrideMin : sum;
}

export function totalPriceCents(lines: ResolvedLine[]): number {
  return lines.reduce((a, l) => a + l.priceCents, 0);
}

/** Local finish "HH:MM" for a start "HH:MM" + duration (wraps at 24h). */
export function finishHHMM(startHHMM: string, durationMin: number): string {
  if (durationMin <= 0) return "";
  const [h, m] = startHHMM.split(":").map(Number);
  const end = h * 60 + m + durationMin;
  return `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}
