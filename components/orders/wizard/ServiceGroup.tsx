"use client";

import type { ServiceWithPrices } from "@/lib/actions/services";
import type { PricingCategory } from "@/lib/supabase/types";
import type { Selection } from "@/lib/orders/booking";
import { resolveServicePrice } from "@/lib/services/price-lookup";
import { formatPriceCents } from "@/lib/services/format";
import { Badge } from "@/components/ui/badge";
import { QuantityStepper } from "./QuantityStepper";

/**
 * A titled group of selectable services (Hlavné / Doplnkové) with per-unit
 * quantity and availability dimming. Extracted unchanged from the original
 * BookingForm so step 3 and the wizard reuse it.
 */
export function ServiceGroup({
  title,
  items,
  category,
  selections,
  onToggle,
  onQty,
}: {
  title: string;
  items: ServiceWithPrices[];
  category: PricingCategory | null;
  selections: Selection[];
  onToggle: (id: string) => void;
  onQty: (id: string, qty: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-xs uppercase text-muted-foreground">{title}</h3>
      <div className="space-y-1">
        {items.map((it) => {
          const sel = selections.find((s) => s.serviceId === it.service.id);
          const price = category ? resolveServicePrice(it.prices, category) : null;
          const unavailable = price !== null && !price.ok;
          return (
            <label
              key={it.service.id}
              data-service-id={it.service.id}
              className={`flex items-center gap-2 rounded border p-2 text-sm ${
                unavailable ? "opacity-50" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={!!sel}
                onChange={() => onToggle(it.service.id)}
                disabled={unavailable}
              />
              <span className="flex-1 truncate">{it.service.name}</span>
              {price?.ok && (
                <Badge variant="secondary" className="text-[10px]">
                  {price.durationMin ?? "—"} min ·{" "}
                  {formatPriceCents(price.priceCents, { from: price.priceFrom })}
                </Badge>
              )}
              {sel && it.service.is_per_unit && (
                <QuantityStepper
                  value={sel.quantity}
                  onChange={(qty) => onQty(it.service.id, qty)}
                />
              )}
              {unavailable && <span className="text-xs text-muted-foreground">nedostupné</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
