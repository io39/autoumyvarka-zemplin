"use client";

import { useMemo } from "react";
import type { ServiceWithPrices } from "@/lib/actions/services";
import type { PricingCategory } from "@/lib/supabase/types";
import {
  resolveSelectionLines,
  totalDurationMin,
  totalPriceCents,
  type Selection,
} from "@/lib/orders/booking";
import { formatPriceCents } from "@/lib/services/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServiceGroup } from "./ServiceGroup";

/**
 * Step 3 — Služby (UI-STRUCTURE §8). Hlavné / Doplnkové checkbox groups with a
 * running Σ-min + Σ-€ summary and an optional manual duration override (advanced).
 * The effective duration sets the step-4 slot length.
 */
export function Step3Services({
  services,
  category,
  selections,
  overrideMin,
  allowOverride = true,
  onToggle,
  onQty,
  onOverrideChange,
}: {
  services: ServiceWithPrices[];
  category: PricingCategory | null;
  selections: Selection[];
  overrideMin: string;
  /** The manual duration override is create-only; in edit mode it isn't persisted. */
  allowOverride?: boolean;
  onToggle: (id: string) => void;
  onQty: (id: string, qty: number) => void;
  onOverrideChange: (value: string) => void;
}) {
  const lines = useMemo(
    () => resolveSelectionLines(selections, services, category),
    [selections, services, category],
  );
  const duration = totalDurationMin(lines, Number(overrideMin));
  const price = totalPriceCents(lines);

  return (
    <section className="space-y-3" data-step="services">
      <ServiceGroup
        title="Hlavné"
        items={services.filter((s) => s.service.kind === "main")}
        category={category}
        selections={selections}
        onToggle={onToggle}
        onQty={onQty}
      />
      <ServiceGroup
        title="Doplnkové"
        items={services.filter((s) => s.service.kind === "addon")}
        category={category}
        selections={selections}
        onToggle={onToggle}
        onQty={onQty}
      />

      {allowOverride && (
        <div className="space-y-1">
          <Label htmlFor="override">Trvanie (min, voliteľné)</Label>
          <Input
            id="override"
            inputMode="numeric"
            className="w-32"
            value={overrideMin}
            onChange={(e) => onOverrideChange(e.target.value)}
            placeholder={String(totalDurationMin(lines))}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        <div data-summary-duration>
          Trvanie: <span className="font-medium">{duration} min</span>
        </div>
        <div data-summary-price>
          Cena spolu: <span className="font-medium">{formatPriceCents(price)}</span>
        </div>
      </div>
    </section>
  );
}
