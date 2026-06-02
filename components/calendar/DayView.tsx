"use client";

import { Fragment } from "react";
import type { CalendarBlock } from "@/lib/actions/orders";
import { bratislavaHHMM } from "@/lib/settings/availability";
import { ROW_PX, SLOT_MIN, diffMinutes, type Interval } from "@/lib/calendar/grid";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { BookingCard } from "./BookingCard";

/**
 * Day view (UI redesign — dynamic calendar): a single CSS grid whose columns are
 * the time axis + one cell per box and whose rows are the 15-min slots
 * (`minmax(ROW_PX, auto)`). Bookings are grid items spanning their slot rows, so
 * a card whose content is taller than its duration grows *those* rows — the whole
 * time-slot expands across both boxes, the axis label moves with it, and nothing
 * overlaps. Empty/other slots stay at the base `ROW_PX`, keeping the day compact.
 *
 * On `sm:+` both boxes show; below that only `activeBox` (the Box 1/Box 2 filter
 * lives in the header). Picking the visible columns in JS (rather than CSS) keeps
 * the dynamic row template and the box count in one place.
 */
export function DayView({
  activeBox,
  rows,
  interval,
  blocks,
}: {
  activeBox: 1 | 2;
  rows: string[];
  interval: Interval;
  blocks: CalendarBlock[];
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const boxes: (1 | 2)[] = isDesktop ? [1, 2] : [activeBox];
  const n = rows.length;

  const colTemplate = `3.25rem ${boxes.map(() => "minmax(0, 1fr)").join(" ")}`;
  // Header row (auto) + one growable row per 15-min slot.
  const rowTemplate = `auto repeat(${n}, minmax(${ROW_PX}px, auto))`;

  return (
    <div className="rounded-lg border p-2">
      <div
        className="grid gap-x-1"
        style={{ gridTemplateColumns: colTemplate, gridTemplateRows: rowTemplate }}
      >
        {/* Header row */}
        <div />
        {boxes.map((box) => (
          <div key={`h-${box}`} className="pb-1 text-center text-sm font-medium">
            Box {box}
          </div>
        ))}

        {/* Slot rows: axis label (col 1) + per-box guide cells. */}
        {rows.map((t, i) => {
          const onHalf = t.endsWith(":00") || t.endsWith(":30");
          return (
            <Fragment key={t}>
              <div
                style={{ gridColumn: 1, gridRow: i + 2 }}
                className={cn(
                  "border-t border-dashed border-muted-foreground/25 pr-1 text-right text-xs leading-none text-muted-foreground",
                  onHalf && "border-muted-foreground/40",
                  t.endsWith(":00") && "font-medium text-foreground/70",
                )}
              >
                {onHalf ? t : ""}
              </div>
              {boxes.map((box, bi) => (
                <div
                  key={`g-${box}-${t}`}
                  data-box={box}
                  style={{ gridColumn: bi + 2, gridRow: i + 2 }}
                  className={cn(
                    "border-t border-dashed border-muted-foreground/25 bg-muted/20",
                    onHalf && "border-muted-foreground/40",
                  )}
                />
              ))}
            </Fragment>
          );
        })}

        {/* Booking cards: grid items spanning their slot rows (rows grow to fit). */}
        {boxes.map((box, bi) =>
          blocks
            .filter((b) => b.order.box === box)
            .map((b) => {
              const startHHMM = bratislavaHHMM(new Date(b.order.starts_at));
              const endHHMM = bratislavaHHMM(new Date(b.order.ends_at));
              const startSlot = Math.max(
                0,
                Math.round(diffMinutes(interval.open, startHHMM) / SLOT_MIN),
              );
              const durSlots = Math.max(1, Math.round(diffMinutes(startHHMM, endHHMM) / SLOT_MIN));
              const rowStart = startSlot + 2;
              const rowEnd = Math.min(rowStart + durSlots, n + 2);
              return (
                <BookingCard
                  key={b.order.id}
                  block={b}
                  density="rich"
                  className="z-10 m-px self-stretch"
                  style={{ gridColumn: bi + 2, gridRow: `${rowStart} / ${rowEnd}` }}
                />
              );
            }),
        )}
      </div>
    </div>
  );
}
