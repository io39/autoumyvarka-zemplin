"use client";

import { Fragment, useEffect, useState } from "react";
import type { CalendarBlock } from "@/lib/actions/orders";
import { bratislavaHHMM } from "@/lib/settings/availability";
import { ROW_PX, SLOT_MIN, diffMinutes, type Interval } from "@/lib/calendar/grid";
import { todayKey } from "@/lib/calendar/today";
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
  date,
  rows,
  interval,
  blocks,
}: {
  activeBox: 1 | 2;
  date: string;
  rows: string[];
  interval: Interval;
  blocks: CalendarBlock[];
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const boxes: (1 | 2)[] = isDesktop ? [1, 2] : [activeBox];
  const n = rows.length;

  // "Now" indicator: a ticking clock so the line slides during the day. Only
  // shown when the displayed day is today and the moment falls inside the grid.
  // Starts null so SSR and the first client render agree (no hydration
  // mismatch); the effect fills it in after mount and ticks it thereafter.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fill is intentional
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  let nowMark: { row: number; topPct: number; label: string } | null = null;
  if (now && todayKey(now) === date) {
    const nowHHMM = bratislavaHHMM(now);
    const minsFromOpen = diffMinutes(interval.open, nowHHMM);
    if (minsFromOpen >= 0 && minsFromOpen < n * SLOT_MIN) {
      const slot = Math.floor(minsFromOpen / SLOT_MIN);
      nowMark = {
        row: slot + 2,
        topPct: ((minsFromOpen - slot * SLOT_MIN) / SLOT_MIN) * 100,
        label: nowHHMM,
      };
    }
  }

  const colTemplate = `3.25rem ${boxes.map(() => "minmax(0, 1fr)").join(" ")}`;
  // Header row (auto) + one growable row per 15-min slot.
  const rowTemplate = `auto repeat(${n}, minmax(${ROW_PX}px, auto))`;

  return (
    <div className="rounded-lg border p-2">
      <div
        className="grid gap-x-4"
        style={{ gridTemplateColumns: colTemplate, gridTemplateRows: rowTemplate }}
      >
        {/* Header row — explicit positions so the spanning frame/divider items
            below can't bump these out of row 1 via auto-placement. */}
        <div style={{ gridColumn: 1, gridRow: 1 }} />
        {boxes.map((box, bi) => (
          <div
            key={`h-${box}`}
            style={{ gridColumn: bi + 2, gridRow: 1 }}
            className="pb-1 text-center text-sm font-medium"
          >
            Box {box}
          </div>
        ))}

        {/* Per-box frame: a rounded border that wraps the whole box column and
            sits a few px outside the slot cells (via -m-1), so the border reads
            a little bigger than the box with a small inset all around. */}
        {boxes.map((box, bi) => (
          <div
            key={`frame-${box}`}
            style={{ gridColumn: bi + 2, gridRow: `2 / ${n + 2}` }}
            className="pointer-events-none -m-1 rounded-lg border"
          />
        ))}

        {/* Divider between Box 1 and Box 2 — same thin line as the week view's
            DAY_DIVIDER, centered in the `gap-x-4` (16px) gutter (left-[-8px]). */}
        {boxes.length === 2 && (
          <div
            style={{ gridColumn: 3, gridRow: `1 / ${n + 2}` }}
            className="pointer-events-none relative top-3 before:absolute before:inset-y-3 before:left-[-11px] before:rounded-lg before:w-1.5 before:bg-foreground/30 before:content-['']"
          />
        )}

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

        {/* Current-time line: black marker across the box columns, sliding by
            the minute. A time badge sits over the axis column; the line spans
            every box. Positioned at the fractional offset within its slot row. */}
        {nowMark && (
          <>
            <div
              style={{ gridColumn: 1, gridRow: nowMark.row }}
              className="pointer-events-none relative z-20"
            >
              <span
                style={{ top: `${nowMark.topPct}%` }}
                className="absolute right-1 -translate-y-1/2 rounded bg-foreground px-1 text-[10px] font-semibold leading-tight text-background tabular-nums"
              >
                {nowMark.label}
              </span>
            </div>
            <div
              style={{ gridColumn: `2 / ${boxes.length + 2}`, gridRow: nowMark.row }}
              className="pointer-events-none relative z-20"
            >
              <div
                style={{ top: `${nowMark.topPct}%` }}
                className="absolute inset-x-0 flex -translate-y-1/2 items-center"
              >
                <span className="-ml-1 size-2 shrink-0 rounded-full bg-foreground" />
                <span className="h-px flex-1 bg-foreground" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
