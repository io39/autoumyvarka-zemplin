"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import type { CalendarBlock } from "@/lib/actions/orders";
import type { PricingCategory } from "@/lib/supabase/types";
import { formatCarLabel, NO_SPZ_LABEL } from "@/lib/cars/format";
import { effectiveTotalCents } from "@/lib/orders/booking";
import { formatPriceCents } from "@/lib/services/format";
import { CATEGORY_BADGE, STATE_COLOR } from "@/types";
import { cn } from "@/lib/utils";
import { useOpenOrderSheet } from "./order-sheet-context";

/**
 * Compact vehicle-category tag (OS / DOD / SUV …) shown next to the car name on
 * the Day-view (`rich`) and Step-4 (`line`) cards. Muted so it reads as a label,
 * not a status. `shrink-0` so it survives when the car name truncates.
 */
function CategoryTag({ category }: { category: PricingCategory }) {
  return (
    <span className="shrink-0 rounded bg-foreground/10 px-1 text-[10px] font-semibold leading-tight">
      {CATEGORY_BADGE[category]}
    </span>
  );
}

/**
 * Presentational order-card content. Text is left-top aligned; the time range is
 * gone (the axis carries it).
 *
 *  - `rich`    → Day calendar. Row 1 = car name + category tag + price; row 2 =
 *                services; row 3 = note (wraps up to 3 lines). The row grows to fit.
 *  - `compact` → Dense Week view. Car name only, single line.
 *  - `line`    → Step-4 occupied blocks. Car name + category tag, single line.
 *
 * No positioning here — callers place the card (grid-row span on the Day view,
 * absolute on Week/Step-4 lanes).
 */
export function BookingCardContent({
  block,
  density,
}: {
  block: CalendarBlock;
  density: "rich" | "compact" | "line";
}) {
  const carName = formatCarLabel(block.car.brand, block.car.model) || block.car.spz || NO_SPZ_LABEL;

  if (density === "compact" || density === "line") {
    // Week view (compact): car name only. Step-4 (line): car name + category tag.
    // Both left-top, truncated; the tag survives the truncate via `shrink-0`.
    return (
      <div className="flex h-full items-center gap-1 overflow-hidden text-left leading-tight">
        <span className="truncate text-[13px] font-medium">{carName}</span>
        {density === "line" && <CategoryTag category={block.car.pricing_category} />}
      </div>
    );
  }

  const activeLines = block.services.filter((s) => !s.removed_at);
  const services = activeLines.map((s) => s.name_snapshot);
  const note = block.order.note?.trim();
  // Displayed total: a manager price override replaces the summed lines (same
  // precedence as order detail / client history / unpaid).
  const lineSum = activeLines.reduce((a, s) => a + s.price_cents_snapshot, 0);
  const totalCents = effectiveTotalCents(lineSum, block.order.price_override_cents);

  // rich (Day view): row 1 = car name + category tag + price (name truncates, tag
  // and price stay visible); row 2 = services; row 3 = note (wraps up to 3 lines).
  return (
    <div className="flex h-full flex-col items-start gap-0.5 overflow-hidden text-left leading-tight">
      <div className="flex w-full items-center gap-1">
        <span className="flex-1 truncate text-sm font-semibold">{carName}</span>
        <CategoryTag category={block.car.pricing_category} />
        <span className="shrink-0 text-xs font-medium tabular-nums">
          {formatPriceCents(totalCents)}
        </span>
      </div>
      {services.length > 0 && (
        <div className="w-full truncate text-xs opacity-80">{services.join(", ")}</div>
      )}
      {note && <div className="line-clamp-3 w-full wrap-break-word text-xs opacity-70">{note}</div>}
    </div>
  );
}

/**
 * Clickable order card: opens the popup Sheet (spec 15) via the calendar's
 * `OpenOrderSheetContext`, or falls back to a `/orders/[id]` link when no
 * provider is present. `className`/`style` carry the per-surface positioning.
 */
export function BookingCard({
  block,
  density,
  className,
  style,
  outsideHours,
}: {
  block: CalendarBlock;
  density: "rich" | "compact" | "line";
  className?: string;
  style?: CSSProperties;
  outsideHours?: boolean;
}) {
  const openOrder = useOpenOrderSheet();
  const c = STATE_COLOR[block.order.status];
  const classes = cn(
    "block overflow-hidden rounded border px-1 py-0.5 text-left transition-opacity hover:opacity-90",
    c.bg,
    c.border,
    c.text,
    outsideHours && "ring-2 ring-amber-500 ring-offset-1",
    className,
  );
  const title = outsideHours ? "Mimo otváracích hodín" : undefined;

  if (openOrder) {
    return (
      <button
        type="button"
        data-order-id={block.order.id}
        data-outside-hours={outsideHours ? "" : undefined}
        title={title}
        className={classes}
        style={style}
        onClick={() => openOrder(block.order.id)}
      >
        <BookingCardContent block={block} density={density} />
      </button>
    );
  }

  return (
    <Link
      href={`/orders/${block.order.id}`}
      data-order-id={block.order.id}
      data-outside-hours={outsideHours ? "" : undefined}
      title={title}
      className={classes}
      style={style}
    >
      <BookingCardContent block={block} density={density} />
    </Link>
  );
}
