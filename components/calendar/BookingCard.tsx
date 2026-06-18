"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import type { CalendarBlock } from "@/lib/actions/orders";
import { formatCarLabel, NO_SPZ_LABEL } from "@/lib/cars/format";
import { STATE_COLOR } from "@/types";
import { cn } from "@/lib/utils";
import { useOpenOrderSheet } from "./order-sheet-context";

/**
 * Presentational order-card content (overlapping-reservations redesign). Text is
 * left-top aligned and the time range / category badge are gone. Row 1 is the
 * car name (make + model, falling back to ŠPZ; truncates model → make when
 * narrow); row 2 (rich only) is the service list, truncated.
 *
 *  - `rich`    → car name + services. Day calendar (the row grows to fit).
 *  - `compact` → car name only. Dense Week view + Step-4 occupied blocks.
 *  - `line`    → alias of compact (single-line car name).
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
    // Week view + Step-4 occupied: car name only, left-top, truncated.
    return (
      <div className="h-full overflow-hidden text-left leading-tight">
        <div className="truncate text-[13px] font-medium">{carName}</div>
      </div>
    );
  }

  const services = block.services
    .filter((s) => !s.removed_at)
    .map((s) => s.name_snapshot);
  const note = block.order.note?.trim();

  // rich (Day view): car name (row 1) + services (row 2) + note (row 3, when set),
  // left-top aligned.
  return (
    <div className="flex h-full flex-col items-start gap-0.5 overflow-hidden text-left leading-tight">
      <div className="w-full truncate text-sm font-semibold">{carName}</div>
      {services.length > 0 && (
        <div className="w-full truncate text-xs opacity-80">{services.join(", ")}</div>
      )}
      {note && <div className="w-full truncate text-xs opacity-70">{note}</div>}
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
