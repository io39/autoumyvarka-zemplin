"use client";

import { useMemo, useState } from "react";
import type { ServiceWithPrices } from "@/lib/actions/services";
import type { PricingCategory } from "@/lib/supabase/types";
import {
  addonGroup,
  resolveSelectionLines,
  totalDurationMin,
  totalPriceCents,
  type Selection,
} from "@/lib/orders/booking";
import { formatPriceCents } from "@/lib/services/format";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ServiceGroup } from "./ServiceGroup";

const ADDON_GROUP_LABEL = {
  tepovanie: "Tepovanie",
  cistenie: "Čistenie",
  ostatne: "Ostatné",
} as const;
const ADDON_GROUP_ORDER = ["tepovanie", "cistenie", "ostatne"] as const;

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

  const addonItems = useMemo(
    () => services.filter((s) => s.service.kind === "addon"),
    [services],
  );
  const addonGroups = useMemo(
    () =>
      ADDON_GROUP_ORDER.map((g) => ({
        group: g,
        items: addonItems.filter((it) => addonGroup(it.service.name) === g),
      })).filter((g) => g.items.length > 0),
    [addonItems],
  );
  const addonIds = useMemo(() => new Set(addonItems.map((it) => it.service.id)), [addonItems]);
  const addonSelectedCount = selections.filter((s) => addonIds.has(s.serviceId)).length;

  // Collapsed by default; once an add-on is selected the section stays open and
  // shows a count. A local toggle handles the no-selection case.
  const [open, setOpen] = useState(addonSelectedCount > 0);
  const accordionValue = addonSelectedCount > 0 || open ? "doplnkove" : "";

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

      {addonItems.length > 0 && (
        <Accordion
          type="single"
          collapsible
          value={accordionValue}
          onValueChange={(v) => setOpen(v === "doplnkove")}
          className="rounded-md border"
        >
          <AccordionItem value="doplnkove" className="border-b-0">
            <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline" data-section="doplnkove">
              <span className="flex items-center gap-2">
                Doplnkové
                {addonSelectedCount > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {addonSelectedCount} vybraté
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 px-3 pb-3">
              {addonGroups.map(({ group, items }) => (
                <ServiceGroup
                  key={group}
                  title={ADDON_GROUP_LABEL[group]}
                  items={items}
                  category={category}
                  selections={selections}
                  onToggle={onToggle}
                  onQty={onQty}
                />
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

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
