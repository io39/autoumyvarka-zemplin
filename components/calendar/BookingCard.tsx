"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import type { CalendarBlock } from "@/lib/actions/orders";
import { bratislavaHHMM } from "@/lib/settings/availability";
import { CATEGORY_BADGE, STATE_COLOR } from "@/types";
import { cn } from "@/lib/utils";
import { useOpenOrderSheet } from "./order-sheet-context";

/**
 * Presentational order-card content (UI redesign — calendar card layout):
 *
 *  - `rich`    → time range on the left; model (prominent) + category badge and
 *                the service list on the right. Used on the Day calendar and the
 *                Step-4 picker. Text truncates/clamps so it stays inside the card;
 *                on the Day grid the row grows to fit (see `DayView`).
 *  - `compact` → time range + model only, stacked. Used on the dense Week view.
 *
 * No positioning here — callers place the card (grid-row span on the Day view,
 * absolute on Week/Step-4).
 */
export function BookingCardContent({
  block,
  density,
}: {
  block: CalendarBlock;
  density: "rich" | "compact" | "line";
}) {
  const start = bratislavaHHMM(new Date(block.order.starts_at));
  const end = bratislavaHHMM(new Date(block.order.ends_at));

  if (density === "line") {
    // Step-4 picker context: time + car brand on a single row, nothing else.
    return (
      <div className="flex h-full items-center gap-1.5 overflow-hidden leading-tight">
        <span className="shrink-0 font-mono text-[13px]">
          {start}–{end}
        </span>
        {block.car.model && (
          <span className="truncate text-[13px] font-medium">{block.car.model}</span>
        )}
      </div>
    );
  }

  if (density === "compact") {
    return (
      <div className="flex h-full flex-col overflow-hidden leading-tight">
        <span className="truncate font-mono text-[10px]">
          {start}–{end}
        </span>
        {block.car.model && (
          <span className="truncate text-[10px] opacity-80">{block.car.model}</span>
        )}
      </div>
    );
  }

  const services = block.services
    .filter((s) => !s.removed_at)
    .map((s) => s.name_snapshot);

  const note = block.order.note?.trim();

  return (
    <div className="flex h-full items-center gap-2 overflow-hidden">
      {/* Left: time range, stacked on two rows — sized so the two lines together
          match the height of the model + note rows on the right. */}
      <div className="flex shrink-0 flex-col font-mono text-[20px] leading-tight opacity-80">
        <span>{start}</span>
        <span>{end}</span>
      </div>
      {/* Right: "model – services" (row 1) + note (row 2, 20px) when present. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="shrink-0 rounded bg-foreground/10 px-1 text-[10px] font-medium uppercase tracking-wide">
            {CATEGORY_BADGE[block.car.pricing_category]}
          </span>
          <span className="truncate text-[20px] leading-tight">
            <span className="font-semibold">{block.car.model ?? "—"}</span>
            {services.length > 0 && (
              <span className="font-normal opacity-80"> – {services.join(", ")}</span>
            )}
          </span>
        </div>
        {note && (
          <div className="flex h-5 items-center truncate text-[20px]"> <span className="font-semibold">Pozn: &nbsp;</span> {note}</div>
        )}
      </div>
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
}: {
  block: CalendarBlock;
  density: "rich" | "compact" | "line";
  className?: string;
  style?: CSSProperties;
}) {
  const openOrder = useOpenOrderSheet();
  const c = STATE_COLOR[block.order.status];
  const classes = cn(
    "block overflow-hidden rounded border px-1 py-0.5 text-left transition-opacity hover:opacity-90",
    c.bg,
    c.border,
    c.text,
    className,
  );

  if (openOrder) {
    return (
      <button
        type="button"
        data-order-id={block.order.id}
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
      className={classes}
      style={style}
    >
      <BookingCardContent block={block} density={density} />
    </Link>
  );
}
