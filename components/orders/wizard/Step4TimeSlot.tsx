"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sk } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCalendar, type CalendarBlock } from "@/lib/actions/orders";
import { getDayOverrides } from "@/lib/actions/settings";
import type { DayOverrideRow, OpeningHoursRow } from "@/lib/supabase/types";
import { getOpenInterval, bratislavaHHMM } from "@/lib/settings/availability";
import {
  SLOT_MIN,
  addDays,
  buildRows,
  computeRowLayout,
  formatDMY,
  formatWeekRange,
  pad,
  skWeekdayShort,
  slotAtOffset,
} from "@/lib/calendar/grid";
import { todayKey } from "@/lib/calendar/today";
import {
  earliestStartToday,
  fitsAt,
  hhmmToMin,
  minToHHMM,
  nearestFreeStarts,
  type BusyInterval,
} from "@/lib/orders/slot-grid";
import { assignLanes } from "@/lib/calendar/lanes";
import { STATE_COLOR } from "@/types";
import { cn } from "@/lib/utils";
import { skPlural } from "@/lib/intl/sk";
import { BookingCardContent } from "@/components/calendar/BookingCard";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PickedSlot } from "./types";

type SlotView = "day" | "3day";
type Interval = { open: string; close: string };

interface DayData {
  blocks: CalendarBlock[];
  interval: Interval | null; // resolved open hours, null = closed
}

const DEFAULT_INTERVAL: Interval = { open: "08:00", close: "17:00" };

// Min width of one lane in the picker (occupied or the reserved free lane): wide
// enough for a car name. A column = lanes × this; when the columns don't fit, the
// grid scrolls horizontally rather than squeezing the lanes below readable width.
const PICKER_MIN_LANE_PX = 96;

function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("sk-SK", { weekday: "short", day: "numeric", month: "numeric" }).format(
    keyToDate(dateKey),
  );
}
function blockStartMin(b: CalendarBlock): number {
  return hhmmToMin(bratislavaHHMM(new Date(b.order.starts_at)));
}
function blockEndMin(b: CalendarBlock): number {
  return hhmmToMin(bratislavaHHMM(new Date(b.order.ends_at)));
}
function busyFor(blocks: CalendarBlock[], box: 1 | 2, excludeOrderId?: string): BusyInterval[] {
  return blocks
    .filter((b) => b.order.box === box && b.order.id !== excludeOrderId)
    .map((b) => ({ startMin: blockStartMin(b), endMin: blockEndMin(b) }));
}

/**
 * Step 4 — Termín (UI-STRUCTURE §8, interactive grid). Existing bookings render
 * as colored read-only blocks, free time as dashed-green VOĽNÉ zones; clicking a
 * box column snaps to a 15-min start and picks it if a booking of the chosen
 * duration fits (no overlap / within open hours / not past). Nearest-free
 * quick-slots sit above each box. Box is implicit. Deň = 2 boxes; 3 dni = 3
 * days × 2 boxes on one shared time axis.
 */
export function Step4TimeSlot({
  durationMin,
  view,
  date,
  picked,
  currentSlot,
  excludeOrderId,
  hours,
  onViewChange,
  onDateChange,
  onPick,
}: {
  durationMin: number;
  view: SlotView;
  date: string;
  picked: PickedSlot | null;
  currentSlot?: PickedSlot | null;
  excludeOrderId?: string;
  hours: OpeningHoursRow[];
  onViewChange: (v: SlotView) => void;
  onDateChange: (dateKey: string) => void;
  onPick: (slot: PickedSlot) => void;
}) {
  const days = useMemo(
    () => (view === "day" ? [date] : [date, addDays(date, 1), addDays(date, 2)]),
    [view, date],
  );
  const wantKey = `${view}|${date}`;
  const [data, setData] = useState<{ key: string; byDay: Record<string, DayData> }>({
    key: "",
    byDay: {},
  });

  // Occupied bookings + per-date overrides for the visible days. `hours` is the
  // weekly schedule (a prop); overrides are per-date so fetched on navigation.
  // `hours` is a prop array (new identity per navigation), but the page only
  // re-renders on navigation that leaves this step, so this fetch isn't churned.
  useEffect(() => {
    const wantK = `${view}|${date}`;
    let cancelled = false;
    Promise.all([
      getDayOverrides({ from: days[0], to: days[days.length - 1] }),
      ...days.map((d) => getCalendar({ view: "day", date: d }).then((blocks) => [d, blocks] as const)),
    ])
      .then((res) => {
        if (cancelled) return;
        const overrides = res[0] as DayOverrideRow[];
        const byDay: Record<string, DayData> = {};
        for (let i = 1; i < res.length; i++) {
          const [d, blocks] = res[i] as readonly [string, CalendarBlock[]];
          byDay[d] = { blocks, interval: getOpenInterval(new Date(`${d}T12:00:00Z`), hours, overrides) };
        }
        setData({ key: wantK, byDay });
      })
      .catch(() => {
        if (!cancelled) setData({ key: wantK, byDay: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [view, date, days, hours]);

  const loading = data.key !== wantKey;

  // Shared axis range: union of the days' open intervals AND every booking's
  // extent, so nothing is clipped outside the grid.
  const grid = useMemo(() => {
    let openMin: number | null = null;
    let closeMin: number | null = null;
    const fold = (a: number, b: number) => {
      openMin = openMin === null ? a : Math.min(openMin, a);
      closeMin = closeMin === null ? b : Math.max(closeMin, b);
    };
    for (const d of days) {
      const dd = data.byDay[d];
      if (dd?.interval) fold(hhmmToMin(dd.interval.open), hhmmToMin(dd.interval.close));
      for (const b of dd?.blocks ?? []) fold(blockStartMin(b), blockEndMin(b));
    }
    if (openMin === null) {
      openMin = hhmmToMin(DEFAULT_INTERVAL.open);
      closeMin = hhmmToMin(DEFAULT_INTERVAL.close);
    }
    return { openMin, closeMin: closeMin as number };
  }, [days, data]);

  const rows = useMemo(() => buildRows(minToHHMM(grid.openMin), minToHHMM(grid.closeMin)), [grid]);
  // Variable row heights: a short occupied booking grows its 15-min row(s) so it
  // stays readable and the shared axis stays aligned (same as the Day view). Built
  // from every visible occupied block (the axis is shared across all columns).
  const rowLayout = useMemo(() => {
    const items = days.flatMap((d) =>
      (data.byDay[d]?.blocks ?? [])
        .filter((b) => b.order.id !== excludeOrderId)
        .map((b) => ({
          startMin: blockStartMin(b) - grid.openMin,
          endMin: blockEndMin(b) - grid.openMin,
        })),
    );
    return computeRowLayout(items, rows.length);
  }, [days, data, grid.openMin, rows.length, excludeOrderId]);
  const rowTop = rowLayout.top;
  // Ticking clock so the current-time line slides and the past cutoff advances.
  // Step 4 is only mounted after the user navigates to it (never at SSR), so a
  // plain `new Date()` initializer is safe (no hydration mismatch).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const nowMin = hhmmToMin(bratislavaHHMM(now));
  const todayK = todayKey(now);
  // Earliest start still bookable today: the slot the clock is currently in is
  // already closed (e.g. at 13:16 the 13:15 slot is gone, 13:30 is the earliest).
  const todayCutoff = earliestStartToday(nowMin);

  // Flatten to ordered (day, box) columns.
  const columns = useMemo(
    () => days.flatMap((day) => [{ day, box: 1 as const }, { day, box: 2 as const }]),
    [days],
  );
  // Thin divider centered in the gutter (a ::before placed half a gap-width into
  // the gap), matching the main calendar. `gap-x-2` = 8px → 4px in. It marks two
  // boundaries: between the two boxes of one day (box 2), and the start of each
  // new day in the 3-day view (box 1 of a subsequent day).
  const DAY_DIVIDER =
    "relative before:pointer-events-none before:absolute before:inset-y-3 before:left-[-7px] before:w-1.5 before:rounded-lg before:bg-foreground/30 before:content-['']";
  const isDayStart = (day: string, box: 1 | 2) =>
    view !== "day" && box === 1 && day !== days[0];
  // Every inter-column gutter gets a divider except the axis | first-box edge.
  const hasDivider = (day: string, box: 1 | 2) => box === 2 || isDayStart(day, box);
  // Touch devices don't fire mouseleave, so a hover-preview ghost would linger on
  // the first-tapped column after picking elsewhere (a stray gray box). Only do
  // the hover preview on hover-capable (mouse) pointers.
  const canHover = useMediaQuery("(hover: hover)");
  // Each box column is sized for its lanes (occupied + the reserved free lane) so
  // every lane stays a readable width; the grid scrolls when they don't all fit.
  const lanesForColumn = (day: string, box: 1 | 2) => {
    const occ = (data.byDay[day]?.blocks ?? []).filter(
      (b) => b.order.box === box && b.order.id !== excludeOrderId,
    );
    const placed = assignLanes(
      occ.map((b) => ({ startMin: blockStartMin(b), endMin: blockEndMin(b) })),
    );
    return placed.reduce((m, p) => Math.max(m, p.lanes), 0) + 1;
  };
  const colTemplate = `2.75rem ${columns
    .map(({ day, box }) => `minmax(${lanesForColumn(day, box) * PICKER_MIN_LANE_PX}px, 1fr)`)
    .join(" ")}`;

  return (
    <section className="space-y-4" data-step="termin">
      <DateControl view={view} date={date} onViewChange={onViewChange} onDateChange={onDateChange} />

      {durationMin <= 0 ? (
        <p className="text-sm text-muted-foreground">
          Najprv vyberte služby s trvaním v kroku Služby.
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Načítavam voľné termíny…</p>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="relative grid min-w-[420px] gap-x-2 gap-y-1"
            style={{ gridTemplateColumns: colTemplate }}
          >
            {/* Day-header row (3-day only) */}
            {view !== "day" && (
              <>
                <div />
                {days.map((day) => (
                  <div
                    key={`dh-${day}`}
                    data-day={day}
                    className="text-center text-sm font-medium capitalize"
                    style={{ gridColumn: "span 2" }}
                  >
                    {dayLabel(day)}
                  </div>
                ))}
              </>
            )}

            {/* Box header row: label + reservation count per box column */}
            <div />
            {columns.map(({ day, box }) => {
              const dd = data.byDay[day];
              const count = (dd?.blocks ?? []).filter(
                (b) => b.order.box === box && b.order.id !== excludeOrderId,
              ).length;
              return (
                <div
                  key={`bh-${day}-${box}`}
                  className={cn(
                    "flex items-baseline justify-between gap-1 border-b pb-1",
                    hasDivider(day, box) && DAY_DIVIDER,
                  )}
                >
                  <span className="text-sm font-semibold">Box {box}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {count}{" "}
                    {skPlural(count, {
                      one: "rezervácia",
                      few: "rezervácie",
                      many: "rezervácií",
                    })}
                  </span>
                </div>
              );
            })}

            {/* Quick "nearest free" slots row */}
            <div />
            {columns.map(({ day, box }) => {
              const dd = data.byDay[day];
              const iv = dd?.interval ?? null;
              const busy = busyFor(dd?.blocks ?? [], box, excludeOrderId);
              // Past day → nothing bookable (cutoff = close); today → after the
              // current slot; future day → from open.
              const fromMin = !iv
                ? 0
                : day < todayK
                  ? hhmmToMin(iv.close)
                  : day === todayK
                    ? Math.max(hhmmToMin(iv.open), todayCutoff)
                    : hhmmToMin(iv.open);
              const quick = iv
                ? nearestFreeStarts(hhmmToMin(iv.open), hhmmToMin(iv.close), durationMin, busy, fromMin, 2)
                : [];
              const selMin =
                picked && picked.dateKey === day && picked.box === box ? hhmmToMin(picked.localStart) : null;
              return (
                <div
                  key={`q-${day}-${box}`}
                  className={cn("space-y-1", hasDivider(day, box) && DAY_DIVIDER)}
                >
                  <div className="flex flex-wrap gap-1.5">
                    {quick.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      quick.map((min) => (
                        <button
                          key={min}
                          type="button"
                          data-quick-slot={`${day}-${box}-${minToHHMM(min)}`}
                          aria-pressed={selMin === min}
                          onClick={() => onPick({ dateKey: day, box, localStart: minToHHMM(min) })}
                          className={cn(
                            "min-h-9 flex-1 rounded-md border px-2.5 py-1.5 text-center font-mono text-sm font-medium transition-colors",
                            selMin === min
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-green-500/50 bg-green-50 text-green-800 hover:bg-green-100 dark:bg-green-950 dark:text-green-300",
                          )}
                        >
                          {minToHHMM(min)}
                          <span className="ml-1 text-xs font-normal opacity-70">
                            – {minToHHMM(min + durationMin)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}

            {/* Grid row: time axis + clickable box columns */}
            <TimeAxis rows={rows} heights={rowLayout.heights} />
            {columns.map(({ day, box }) => {
              const dd = data.byDay[day];
              const column = (
                <GridColumn
                  day={day}
                  box={box}
                  rows={rows}
                  rowTop={rowTop}
                  gridOpenMin={grid.openMin}
                  dayInterval={dd?.interval ?? null}
                  busy={busyFor(dd?.blocks ?? [], box, excludeOrderId)}
                  blocks={(dd?.blocks ?? []).filter(
                    (b) => b.order.box === box && b.order.id !== excludeOrderId,
                  )}
                  durationMin={durationMin}
                  isToday={day === todayK}
                  isPast={day < todayK}
                  todayCutoff={todayCutoff}
                  canHover={canHover}
                  picked={picked}
                  currentSlot={currentSlot}
                  onPick={onPick}
                />
              );
              // The grid column is overflow-hidden, which would clip the gutter
              // divider, so wrap it: the divider ::before lives on the wrapper.
              return hasDivider(day, box) ? (
                <div key={`g-${day}-${box}`} className={DAY_DIVIDER}>
                  {column}
                </div>
              ) : (
                <div key={`g-${day}-${box}`}>{column}</div>
              );
            })}

            {/* Current-time line — a single black marker spanning today's two
                box columns (including the gutter), sliding with the clock, just
                like the main calendar. Absolutely positioned so it overlays the
                grid area without reserving cells (which would bump the columns). */}
            {(() => {
              const todayIdx = days.indexOf(todayK);
              if (todayIdx < 0) return null;
              if (nowMin < grid.openMin || nowMin > grid.openMin + rows.length * SLOT_MIN) return null;
              const startCol = 2 + todayIdx * 2; // axis is col 1; 2 cols per day
              const gridRow = view === "day" ? 3 : 4;
              // Fractional position within the (possibly grown) row the clock is in.
              const relMin = nowMin - grid.openMin;
              const slot = Math.floor(relMin / SLOT_MIN);
              const top =
                slot >= rows.length
                  ? rowTop[rows.length]
                  : rowTop[slot] +
                    ((relMin - slot * SLOT_MIN) / SLOT_MIN) * (rowTop[slot + 1] - rowTop[slot]);
              return (
                <>
                  {/* Time badge over the axis column (col 1). */}
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 justify-end pr-1"
                    style={{ gridColumn: "1 / 2", gridRow, top }}
                  >
                    <span className="rounded bg-foreground px-1 text-[10px] font-semibold leading-tight text-background tabular-nums">
                      {minToHHMM(nowMin)}
                    </span>
                  </div>
                  {/* Line across today's two box columns. */}
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 items-center"
                    style={{ gridColumn: `${startCol} / ${startCol + 2}`, gridRow, top }}
                  >
                    <span className="-ml-0.5 size-1.5 shrink-0 rounded-full bg-foreground" />
                    <span className="h-px flex-1 bg-foreground" />
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <SelectionBar picked={picked} durationMin={durationMin} />
    </section>
  );
}

function TimeAxis({ rows, heights }: { rows: string[]; heights: number[] }) {
  const total = heights.reduce((a, h) => a + h, 0);
  return (
    <div className="text-[11px] text-muted-foreground" style={{ height: total }}>
      {rows.map((t, i) => (
        <div
          key={t}
          style={{ height: heights[i] }}
          className={cn(
            "pr-1 text-right leading-none",
            t.endsWith(":00") && "font-medium text-foreground/70",
          )}
        >
          {t.endsWith(":00") || t.endsWith(":30") ? t : ""}
        </div>
      ))}
    </div>
  );
}

function GridColumn({
  day,
  box,
  rows,
  rowTop,
  gridOpenMin,
  dayInterval,
  busy,
  blocks,
  durationMin,
  isToday,
  isPast,
  todayCutoff,
  canHover,
  picked,
  currentSlot,
  onPick,
}: {
  day: string;
  box: 1 | 2;
  rows: string[];
  /** Cumulative px offsets of the (possibly grown) 15-min rows, length n+1. */
  rowTop: number[];
  gridOpenMin: number;
  dayInterval: Interval | null;
  busy: BusyInterval[];
  blocks: CalendarBlock[];
  durationMin: number;
  isToday: boolean;
  isPast: boolean;
  todayCutoff: number;
  canHover: boolean;
  picked: PickedSlot | null;
  currentSlot?: PickedSlot | null;
  onPick: (slot: PickedSlot) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const n = rows.length;
  const heightPx = rowTop[n];

  const dayOpenMin = dayInterval ? hhmmToMin(dayInterval.open) : 0;
  const dayCloseMin = dayInterval ? hhmmToMin(dayInterval.close) : 0;
  // Future-only floor for the quick-slots and the keyboard "nearest free" pick:
  // past day → nothing suggested (floor = close); today → after the current
  // 15-min slot; future day → from open. Manual grid picking ignores this floor
  // (past slots are pickable), but the suggestions stay anchored to "now".
  const fromMin = isPast ? dayCloseMin : isToday ? Math.max(dayOpenMin, todayCutoff) : dayOpenMin;

  // Lane-place the occupied bookings and reserve ONE extra "free" lane for the
  // new booking (1 existing → halves, 2 → thirds, 3 → fourths …). The reserved
  // lane is the rightmost; the pick ghost renders there.
  const placed = assignLanes(
    blocks.map((b) => ({ block: b, startMin: blockStartMin(b), endMin: blockEndMin(b) })),
  );
  const occLanes = placed.reduce((m, p) => Math.max(m, p.lanes), 0);
  const totalLanes = occLanes + 1;
  const freeLane = occLanes; // rightmost, reserved for the new reservation
  const laneStyle = (lane: number) => ({
    left: `calc(${(lane / totalLanes) * 100}% + 1px)`,
    width: `calc(${100 / totalLanes}% - 2px)`,
  });

  // px position of a minute, following the (possibly grown) variable rows.
  const top = (min: number) => {
    const rel = min - gridOpenMin;
    const slot = Math.floor(rel / SLOT_MIN);
    if (slot < 0) return 0;
    if (slot >= n) return rowTop[n];
    return rowTop[slot] + ((rel - slot * SLOT_MIN) / SLOT_MIN) * (rowTop[slot + 1] - rowTop[slot]);
  };
  const span = (a: number, b: number) => Math.max(2, top(b) - top(a));

  function startFromEvent(e: React.MouseEvent): number | null {
    if (!dayInterval || !ref.current) return null;
    const y = e.clientY - ref.current.getBoundingClientRect().top;
    const start = gridOpenMin + slotAtOffset(rowTop, y) * SLOT_MIN;
    // Overlap is allowed now (migration 0016): any open-hours slot is pickable,
    // even occupied ones (the wizard confirms the clash on save). Only the open
    // window bounds gate the click (`busy = []`). The future-only `fromMin` floor
    // still drives the quick-slots and the keyboard "nearest free" pick.
    return fitsAt(start, durationMin, dayOpenMin, dayCloseMin, []) ? start : null;
  }

  const selMin =
    picked && picked.dateKey === day && picked.box === box ? hhmmToMin(picked.localStart) : null;
  const curMin =
    currentSlot && currentSlot.dateKey === day && currentSlot.box === box
      ? hhmmToMin(currentSlot.localStart)
      : null;

  return (
    <div
      ref={ref}
      data-box={box}
      data-day={day}
      role="button"
      tabIndex={0}
      aria-label={`Box ${box} · klikom vyberte čas`}
      title={`Box ${box} · klikom vyberte čas`}
      onMouseMove={(e) => canHover && setHoverMin(startFromEvent(e))}
      onMouseLeave={() => setHoverMin(null)}
      onClick={(e) => {
        const s = startFromEvent(e);
        if (s !== null) onPick({ dateKey: day, box, localStart: minToHHMM(s) });
      }}
      onKeyDown={(e) => {
        // Keyboard: Enter/Space picks the nearest free start (fine-grained
        // selection is mouse-driven; the quick-slots above are also focusable).
        if (e.key !== "Enter" && e.key !== " ") return;
        if (!dayInterval) return;
        e.preventDefault();
        const near = nearestFreeStarts(dayOpenMin, dayCloseMin, durationMin, busy, fromMin, 1)[0];
        if (near !== undefined) onPick({ dateKey: day, box, localStart: minToHHMM(near) });
      }}
      className="relative cursor-pointer select-none overflow-hidden rounded-md border bg-muted/20"
      style={{ height: heightPx }}
    >
      {/* 15-min row guides (variable heights — a short booking grew its row) */}
      {rows.map((t, i) => (
        <div
          key={t}
          className={cn(
            "absolute inset-x-0 border-t border-dashed border-muted-foreground/25",
            (t.endsWith(":00") || t.endsWith(":30")) && "border-muted-foreground/40",
          )}
          style={{ top: rowTop[i], height: rowTop[i + 1] - rowTop[i] }}
        />
      ))}

      {/* Closed-hours greying */}
      {dayInterval ? (
        <>
          {dayOpenMin > gridOpenMin && (
            <div className="absolute inset-x-0 top-0 bg-muted/60" style={{ height: top(dayOpenMin) }} />
          )}
          <div className="absolute inset-x-0 bg-muted/60" style={{ top: top(dayCloseMin), bottom: 0 }} />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
          zatvorené
        </div>
      )}

      {/* Past (MINULOSŤ) tint: today up to the cutoff, or a whole past day.
          Rendered behind the free zones — a hint, not a block: past slots stay
          pickable, so the green VOĽNÉ zones sit on top and remain clickable. */}
      {(isToday || isPast) && fromMin > gridOpenMin && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-center bg-foreground/5 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground"
          style={{ height: top(fromMin) }}
        >
          Minulosť
        </div>
      )}

      {/* Reserved "free" lane background (only when something is occupied) — the
          prepared space where the new booking will sit. */}
      {dayInterval && occLanes > 0 && (
        <div
          className="pointer-events-none absolute rounded border border-dashed border-primary/30 bg-primary/5"
          style={{
            ...laneStyle(freeLane),
            top: top(dayOpenMin) + 1,
            height: span(dayOpenMin, dayCloseMin) - 2,
          }}
        />
      )}

      {/* Occupied bookings, lane-placed — read-only context (clicks pick a time). */}
      {placed.map((p) => {
        const c = STATE_COLOR[p.block.order.status];
        return (
          <div
            key={p.block.order.id}
            data-occupied-order={p.block.order.id}
            className={cn(
              "pointer-events-none absolute overflow-hidden rounded border px-1 py-0.5",
              c.bg,
              c.border,
              c.text,
            )}
            style={{ ...laneStyle(p.lane), top: top(p.startMin) + 1, height: span(p.startMin, p.endMin) - 2 }}
          >
            <BookingCardContent block={p.block} density="line" />
          </div>
        );
      })}

      {/* Edit mode: the order's own current slot — outlined, in the free lane. */}
      {curMin !== null && (
        <div
          className="pointer-events-none absolute rounded border-2 border-dashed border-primary/70"
          style={{ ...laneStyle(freeLane), top: top(curMin) + 1, height: span(curMin, curMin + durationMin) - 2 }}
        />
      )}

      {/* Hover preview ghost — mouse only, rendered in the reserved free lane. */}
      {canHover && hoverMin !== null && hoverMin !== selMin && (
        <div
          className="pointer-events-none absolute rounded border-2 border-primary/50 bg-primary/10"
          style={{ ...laneStyle(freeLane), top: top(hoverMin) + 1, height: span(hoverMin, hoverMin + durationMin) - 2 }}
        />
      )}

      {/* Selected ghost — in the reserved free lane. */}
      {selMin !== null && (
        <div
          data-selected-slot={`${day}-${box}-${minToHHMM(selMin)}`}
          className="pointer-events-none absolute flex items-center justify-center whitespace-nowrap rounded border-2 border-primary bg-primary/20 px-0.5 text-[10px] font-medium text-primary"
          style={{ ...laneStyle(freeLane), top: top(selMin) + 1, height: span(selMin, selMin + durationMin) - 2 }}
        >
          {minToHHMM(selMin)}–{minToHHMM(selMin + durationMin)}
        </div>
      )}
    </div>
  );
}

function SelectionBar({ picked, durationMin }: { picked: PickedSlot | null; durationMin: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-4 py-3 text-center text-sm" data-selection-bar>
      {picked ? (
        <span>
          <span className="font-medium">Box {picked.box}</span> · {dayLabel(picked.dateKey)} ·{" "}
          <span className="font-mono">
            {picked.localStart}–{minToHHMM(hhmmToMin(picked.localStart) + durationMin)}
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground">Žiadny termín nevybraný</span>
      )}
    </div>
  );
}

function DateControl({
  view,
  date,
  onViewChange,
  onDateChange,
}: {
  view: SlotView;
  date: string;
  onViewChange: (v: SlotView) => void;
  onDateChange: (dateKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tk = todayKey(new Date());
  const coversToday =
    view === "day" ? date === tk : [date, addDays(date, 1), addDays(date, 2)].includes(tk);
  const step = view === "day" ? 1 : 3;

  return (
    // Mobile: switch on top, then a full-width row (date left, DNES right).
    // Desktop: 3 columns — switch left, date+today centered, right empty —
    // mirroring the main calendar controls row.
    <div className="flex flex-col items-center gap-2 md:grid md:grid-cols-3 md:items-center md:gap-1 md:mx-13">
      <div className="inline-flex rounded-md border md:justify-self-start">
        <Button
          size="sm"
          variant={view === "day" ? "default" : "ghost"}
          className="rounded-r-none"
          onClick={() => onViewChange("day")}
        >
          Deň
        </Button>
        <Button
          size="sm"
          variant={view === "3day" ? "default" : "ghost"}
          className="rounded-l-none"
          onClick={() => onViewChange("3day")}
        >
          3 dni
        </Button>
      </div>

      <div className="flex items-center justify-between gap-10 md:justify-center md:gap-1">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Predošlý" onClick={() => onDateChange(addDays(date, -step))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="font-semibold" data-date-trigger>
                {view === "day"
                  ? `${skWeekdayShort(date)} ${formatDMY(date)}`
                  : formatWeekRange(date, addDays(date, 2))}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={keyToDate(date)}
                defaultMonth={keyToDate(date)}
                captionLayout="dropdown"
                locale={sk}
                weekStartsOn={1}
                startMonth={new Date(2020, 0)}
                endMonth={new Date(2035, 11)}
                onSelect={(d) => {
                  if (!d) return;
                  setOpen(false);
                  onDateChange(dateToKey(d));
                }}
              />
            </PopoverContent>
          </Popover>
          <Button size="icon" variant="ghost" aria-label="Nasledujúci" onClick={() => onDateChange(addDays(date, step))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center w-32 justify-center">
          <div className="flex h-7 items-center">
            {coversToday ? (
              <span className="text-xs font-medium text-muted-foreground">DNES</span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => onDateChange(todayKey(new Date()))}>
                Späť na dnes
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
