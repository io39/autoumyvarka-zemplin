"use client";

import { Fragment, useEffect, useState } from "react";
import type { CalendarBlock } from "@/lib/actions/orders";
import { bratislavaHHMM } from "@/lib/settings/availability";
import { ROW_PX, SLOT_MIN, computeRowLayout, diffMinutes, type Interval } from "@/lib/calendar/grid";
import { todayKey } from "@/lib/calendar/today";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useFillHeight } from "@/lib/hooks/use-fill-height";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { BookingCard } from "./BookingCard";
import { ClosedZone } from "./closed-zone";
import { placeBoxLanes } from "./placeLanes";

// Minimum width of a single lane (overlapping-reservations redesign): wide enough
// for the car name. When a box needs more lanes than fit, the grid scrolls
// horizontally rather than squeezing cards below this.
const MIN_LANE_PX = 104;

// A card with a note shows a 3rd row, so a short note-bearing booking needs a
// taller minimum than the default (car name + services only).
const MIN_CARD_PX_NOTE = 60;

/**
 * Day view (overlapping-reservations redesign): a CSS grid of the time axis +
 * one column per box. Rows are 15-min slots; a short booking **grows its row(s)**
 * (`computeRows`) so its content fits and the axis stays aligned. Bookings are
 * absolutely positioned within their box column (top/height from the cumulative
 * row offsets) and, when they overlap, split into equal side-by-side lanes
 * (`assignLanes`). Each lane keeps a minimum width; a box that needs more lanes
 * than fit widens the grid, which scrolls horizontally.
 *
 * On `sm:+` both boxes show; below that only `activeBox` (the filter lives in
 * the header).
 */
export function DayView({
  activeBox,
  date,
  rows,
  interval,
  openInterval,
  blocks,
}: {
  activeBox: 1 | 2;
  date: string;
  rows: string[];
  /** The grid range — the open interval **extended** to cover out-of-hours bookings. */
  interval: Interval;
  /** The day's TRUE open interval (null = closed). The parts of `interval` outside
      it are greyed (closed zones), and a booking outside it is marked out-of-hours. */
  openInterval: Interval | null;
  blocks: CalendarBlock[];
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const boxes: (1 | 2)[] = isDesktop ? [1, 2] : [activeBox];
  const n = rows.length;
  const placedByBox = new Map(boxes.map((box) => [box, placeBoxLanes(blocks, box, interval.open)]));
  // Row heights are shared across both boxes (one time axis), so a short booking
  // in either box grows that row for the whole grid.
  const allPlaced = boxes.flatMap((box) => placedByBox.get(box)?.placed ?? []);
  const { heights: rowHeights, top: rowTop } = computeRowLayout(
    allPlaced.map((p) => ({
      startMin: p.startMin,
      endMin: p.endMin,
      minPx: p.block.order.note?.trim() ? MIN_CARD_PX_NOTE : undefined,
    })),
    n,
  );

  // Closed-zone greying: the parts of the (extended) grid that lie outside the
  // day's true open interval. Offsets come from the cumulative row tops so they
  // align with the variable-height rows. A fully-closed day greys the whole grid.
  const totalPx = rowTop[n];
  const slotPx = (mins: number) => rowTop[Math.max(0, Math.min(n, Math.round(mins / SLOT_MIN)))];
  const openStartMin = openInterval ? diffMinutes(interval.open, openInterval.open) : 0;
  const openEndMin = openInterval ? diffMinutes(interval.open, openInterval.close) : 0;
  const closedTopPx = openInterval ? slotPx(openStartMin) : totalPx;
  const closedBottomPx = openInterval ? slotPx(openEndMin) : totalPx;

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

  // Each box column is at least lane-count × MIN_LANE_PX wide; minmax lets it
  // grow to share the viewport, or overflow (→ horizontal scroll) when many lanes.
  const colTemplate = `3.25rem ${boxes
    .map((box) => `minmax(${(placedByBox.get(box)?.lanes ?? 1) * MIN_LANE_PX}px, 1fr)`)
    .join(" ")}`;
  // Header row (auto) + per-slot rows (each ≥ ROW_PX; short bookings grow theirs).
  const rowTemplate = `auto ${rowHeights.map((h) => `${h}px`).join(" ")}`;

  // Desktop: fill to the viewport so the grid scrolls internally and the bottom
  // scrollbar stays on screen (mobile: undefined → natural page flow).
  const { ref, height } = useFillHeight<HTMLDivElement>();

  return (
    // Horizontal scroll with a visible bottom scrollbar on desktop (md:+); on
    // mobile the viewport touch-scrolls natively and the bar stays hidden.
    <div ref={ref}>
      <ScrollArea
        type="auto"
        className="rounded-lg border"
        style={height ? { height } : undefined}
      >
      <div
        className="grid gap-x-4 p-2"
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

        {/* Booking layer: one relative container per box (spanning all slot
            rows) holding the absolutely-positioned cards. Overlapping cards are
            split into equal side-by-side lanes. */}
        {boxes.map((box, bi) => {
          const { placed } = placedByBox.get(box)!;
          return (
            <div
              key={`bk-${box}`}
              className="relative z-10"
              style={{ gridColumn: bi + 2, gridRow: `2 / ${n + 2}` }}
            >
              {/* Closed zones (before open / after close) — striped grey hatch +
                  a boundary line + a label, so it clearly reads as "outside
                  opening hours". Rendered behind the cards. */}
              {closedTopPx > 0 && (
                <ClosedZone
                  top={0}
                  height={closedTopPx}
                  side="before"
                  label={openInterval ? "Mimo otváracích hodín" : "Zatvorené"}
                />
              )}
              {closedBottomPx < totalPx && (
                <ClosedZone
                  top={closedBottomPx}
                  height={totalPx - closedBottomPx}
                  side="after"
                  label="Mimo otváracích hodín"
                />
              )}
              {placed.map((p) => {
                // top/height from the cumulative (variable) row offsets so the
                // card aligns with the grown rows and the axis. Clamp to the
                // SAME bounds as computeRowLayout — sSlot ≤ n-1 and eSlot ≤ n —
                // so a booking that falls at/after the grid's last slot (e.g. one
                // created outside the day's open hours) renders as a 1-slot
                // sliver at the bottom instead of indexing rowTop[n+1] (undefined
                // → NaN height).
                const sSlot = Math.max(0, Math.min(n - 1, Math.round(p.startMin / SLOT_MIN)));
                const eSlot = Math.min(n, Math.max(sSlot + 1, Math.round(p.endMin / SLOT_MIN)));
                const top = rowTop[sSlot];
                const height = rowTop[eSlot] - rowTop[sSlot];
                // Out of hours = outside the day's TRUE open interval (the grid is
                // extended to cover it, so compare against openInterval, not the grid).
                const outsideHours =
                  !openInterval || p.startMin < openStartMin || p.endMin > openEndMin;
                return (
                  <BookingCard
                    key={p.block.order.id}
                    block={p.block}
                    density="rich"
                    className="absolute"
                    outsideHours={outsideHours}
                    style={{
                      top: top + 1,
                      height: height - 2,
                      left: `calc(${(p.lane / p.lanes) * 100}% + 1px)`,
                      width: `calc(${100 / p.lanes}% - 2px)`,
                    }}
                  />
                );
              })}
            </div>
          );
        })}

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
      <ScrollBar orientation="horizontal" className="hidden md:flex" />
      </ScrollArea>
    </div>
  );
}
