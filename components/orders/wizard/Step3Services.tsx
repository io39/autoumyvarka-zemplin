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
import { formatPriceCents, parseEurosToCents } from "@/lib/services/format";
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
  priceOverride,
  allowPriceOverride = false,
  note,
  onToggle,
  onQty,
  onOverrideChange,
  onPriceOverrideChange,
  onNoteChange,
}: {
  services: ServiceWithPrices[];
  category: PricingCategory | null;
  selections: Selection[];
  overrideMin: string;
  /** The manual duration override is create-only; in edit mode it isn't persisted. */
  allowOverride?: boolean;
  /** Manager-entered manual order total (euros, as typed). */
  priceOverride: string;
  /** Only managers may override the price (PRD §3). */
  allowPriceOverride?: boolean;
  note: string;
  onToggle: (id: string) => void;
  onQty: (id: string, qty: number) => void;
  onOverrideChange: (value: string) => void;
  onPriceOverrideChange: (value: string) => void;
  onNoteChange: (value: string) => void;
}) {
  const lines = useMemo(
    () => resolveSelectionLines(selections, services, category),
    [selections, services, category],
  );
  const duration = totalDurationMin(lines, Number(overrideMin));
  const lineSum = totalPriceCents(lines);
  // The override (when a manager has typed a valid amount) replaces the summed
  // line price in the running total; otherwise the line sum shows.
  const overrideCents = allowPriceOverride ? parseEurosToCents(priceOverride) : null;
  const price = overrideCents ?? lineSum;

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

      <div className="flex flex-wrap gap-4">
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
        {allowPriceOverride && (
          <div className="space-y-1">
            <Label htmlFor="price-override">Cena (€, voliteľné)</Label>
            <Input
              id="price-override"
              data-price-override
              inputMode="decimal"
              className="w-32"
              value={priceOverride}
              onChange={(e) => onPriceOverrideChange(e.target.value)}
              placeholder={(lineSum / 100).toFixed(2).replace(".", ",")}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        <div data-summary-duration>
          Trvanie: <span className="font-medium">{duration} min</span>
        </div>
        <div data-summary-price>
          Cena spolu: <span className="font-medium">{formatPriceCents(price)}</span>
          {overrideCents !== null && (
            <span className="ml-1 text-xs text-muted-foreground">(upravená)</span>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="order-note">Poznámka (voliteľné)</Label>
        <textarea
          id="order-note"
          data-order-note
          className="w-full rounded-md border bg-background p-2 text-sm"
          rows={2}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Poznámka k objednávke…"
        />
      </div>
    </section>
  );
}
