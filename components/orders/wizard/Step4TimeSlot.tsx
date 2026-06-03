"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sk } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCalendar, type CalendarBlock } from "@/lib/actions/orders";
import { getDayOverrides } from "@/lib/actions/settings";
import type { DayOverrideRow, OpeningHoursRow } from "@/lib/supabase/types";
import { getOpenInterval, bratislavaHHMM } from "@/lib/settings/availability";
import { ROW_PX, SLOT_MIN, addDays, buildRows, pad } from "@/lib/calendar/grid";
import { todayKey } from "@/lib/calendar/today";
import {
  computeFreeZones,
  fitsAt,
  hhmmToMin,
  minToHHMM,
  nearestFreeStarts,
  offsetToStartMin,
  type BusyInterval,
} from "@/lib/orders/slot-grid";
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
  const now = new Date();
  const nowMin = hhmmToMin(bratislavaHHMM(now));
  const todayK = todayKey(now);

  // Flatten to ordered (day, box) columns.
  const columns = useMemo(
    () => days.flatMap((day) => [{ day, box: 1 as const }, { day, box: 2 as const }]),
    [days],
  );
  // In the 3-day view, the first box column of each subsequent day starts a new
  // day — mark it with a left divider + gutter so adjacent days are easy to tell
  // apart (the two boxes of one day stay visually grouped).
  const DAY_DIVIDER = "ml-2 border-l-2 border-foreground/15";
  const isDayStart = (day: string, box: 1 | 2) =>
    view !== "day" && box === 1 && day !== days[0];
  // Deň fills the width (2 boxes). 3 dni gives each of the 6 box-columns a wide
  // tap-friendly minimum on mobile (the grid side-scrolls there); on desktop the
  // columns shrink to fit the container so there is no horizontal scroll.
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const colTemplate =
    view === "day"
      ? "2.75rem repeat(2, minmax(0, 1fr))"
      : `2.75rem repeat(${columns.length}, minmax(${isDesktop ? "0" : "8.5rem"}, 1fr))`;

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
            className="grid min-w-[420px] gap-x-2 gap-y-1"
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
                    isDayStart(day, box) && DAY_DIVIDER,
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
              const fromMin = day === todayK && iv ? Math.max(hhmmToMin(iv.open), nowMin) : iv ? hhmmToMin(iv.open) : 0;
              const quick = iv
                ? nearestFreeStarts(hhmmToMin(iv.open), hhmmToMin(iv.close), durationMin, busy, fromMin, 2)
                : [];
              const selMin =
                picked && picked.dateKey === day && picked.box === box ? hhmmToMin(picked.localStart) : null;
              return (
                <div
                  key={`q-${day}-${box}`}
                  className={cn("space-y-1", isDayStart(day, box) && DAY_DIVIDER)}
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
            <TimeAxis rows={rows} />
            {columns.map(({ day, box }) => {
              const dd = data.byDay[day];
              return (
                <GridColumn
                  key={`g-${day}-${box}`}
                  day={day}
                  box={box}
                  className={isDayStart(day, box) ? DAY_DIVIDER : undefined}
                  rows={rows}
                  gridOpenMin={grid.openMin}
                  dayInterval={dd?.interval ?? null}
                  busy={busyFor(dd?.blocks ?? [], box, excludeOrderId)}
                  blocks={(dd?.blocks ?? []).filter(
                    (b) => b.order.box === box && b.order.id !== excludeOrderId,
                  )}
                  durationMin={durationMin}
                  isToday={day === todayK}
                  nowMin={nowMin}
                  picked={picked}
                  currentSlot={currentSlot}
                  onPick={onPick}
                />
              );
            })}
          </div>
        </div>
      )}

      <SelectionBar picked={picked} durationMin={durationMin} />
    </section>
  );
}

function TimeAxis({ rows }: { rows: string[] }) {
  return (
    <div className="text-[11px] text-muted-foreground" style={{ height: rows.length * ROW_PX }}>
      {rows.map((t) => (
        <div
          key={t}
          style={{ height: ROW_PX }}
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
  className,
  rows,
  gridOpenMin,
  dayInterval,
  busy,
  blocks,
  durationMin,
  isToday,
  nowMin,
  picked,
  currentSlot,
  onPick,
}: {
  day: string;
  box: 1 | 2;
  className?: string;
  rows: string[];
  gridOpenMin: number;
  dayInterval: Interval | null;
  busy: BusyInterval[];
  blocks: CalendarBlock[];
  durationMin: number;
  isToday: boolean;
  nowMin: number;
  picked: PickedSlot | null;
  currentSlot?: PickedSlot | null;
  onPick: (slot: PickedSlot) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const heightPx = rows.length * ROW_PX;

  const dayOpenMin = dayInterval ? hhmmToMin(dayInterval.open) : 0;
  const dayCloseMin = dayInterval ? hhmmToMin(dayInterval.close) : 0;
  const fromMin = isToday ? Math.max(dayOpenMin, nowMin) : dayOpenMin;
  const freeZones = dayInterval ? computeFreeZones(dayOpenMin, dayCloseMin, busy) : [];

  const top = (min: number) => ((min - gridOpenMin) / SLOT_MIN) * ROW_PX;
  const span = (a: number, b: number) => Math.max(ROW_PX, ((b - a) / SLOT_MIN) * ROW_PX);

  function startFromEvent(e: React.MouseEvent): number | null {
    if (!dayInterval || !ref.current) return null;
    const y = e.clientY - ref.current.getBoundingClientRect().top;
    const start = offsetToStartMin(y, gridOpenMin, ROW_PX);
    if (start < fromMin) return null;
    return fitsAt(start, durationMin, dayOpenMin, dayCloseMin, busy) ? start : null;
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
      onMouseMove={(e) => setHoverMin(startFromEvent(e))}
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
      className={cn(
        "relative cursor-pointer select-none overflow-hidden rounded-md border bg-muted/20",
        className,
      )}
      style={{ height: heightPx }}
    >
      {/* 15-min row guides */}
      {rows.map((t, i) => (
        <div
          key={t}
          className={cn(
            "absolute inset-x-0 border-t border-dashed border-muted-foreground/25",
            (t.endsWith(":00") || t.endsWith(":30")) && "border-muted-foreground/40",
          )}
          style={{ top: i * ROW_PX, height: ROW_PX }}
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

      {/* Free VOĽNÉ zones */}
      {freeZones.map((z) => (
        <div
          key={z.startMin}
          className="pointer-events-none absolute inset-x-1 flex items-center justify-center rounded border border-dashed border-green-500/60 bg-green-50/50 text-[10px] uppercase tracking-wide text-green-700 dark:bg-green-950/40 dark:text-green-400"
          style={{ top: top(z.startMin) + 1, height: span(z.startMin, z.endMin) - 2 }}
        >
          {span(z.startMin, z.endMin) >= 30 && z.endMin - z.startMin >= durationMin ? "Voľné" : ""}
        </div>
      ))}

      {/* Past (MINULOSŤ) overlay for today */}
      {isToday && fromMin > gridOpenMin && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-center bg-foreground/5 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground"
          style={{ height: top(fromMin) }}
        >
          Minulosť
        </div>
      )}

      {/* Occupied bookings — read-only context (click passes through to picking) */}
      {blocks.map((b) => {
        const c = STATE_COLOR[b.order.status];
        return (
          <div
            key={b.order.id}
            data-occupied-order={b.order.id}
            className={cn(
              "pointer-events-none absolute inset-x-1 overflow-hidden rounded border px-1 py-0.5",
              c.bg,
              c.border,
              c.text,
            )}
            style={{ top: top(blockStartMin(b)) + 1, height: span(blockStartMin(b), blockEndMin(b)) - 2 }}
          >
            <BookingCardContent block={b} density="line" />
          </div>
        );
      })}

      {/* Edit mode: the order's own current slot — outlined, still pickable */}
      {curMin !== null && (
        <div
          className="pointer-events-none absolute inset-x-1 rounded border-2 border-dashed border-primary/70"
          style={{ top: top(curMin) + 1, height: span(curMin, curMin + durationMin) - 2 }}
        />
      )}

      {/* Hover preview ghost */}
      {hoverMin !== null && hoverMin !== selMin && (
        <div
          className="pointer-events-none absolute inset-x-1 rounded border-2 border-primary/50 bg-primary/10"
          style={{ top: top(hoverMin) + 1, height: span(hoverMin, hoverMin + durationMin) - 2 }}
        />
      )}

      {/* Selected ghost */}
      {selMin !== null && (
        <div
          data-selected-slot={`${day}-${box}-${minToHHMM(selMin)}`}
          className="pointer-events-none absolute inset-x-1 flex items-center justify-center whitespace-nowrap rounded border-2 border-primary bg-primary/20 px-0.5 text-[10px] font-medium text-primary"
          style={{ top: top(selMin) + 1, height: span(selMin, selMin + durationMin) - 2 }}
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
    <div className="flex flex-col items-center gap-2">
      <div className="inline-flex rounded-md border">
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

      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" aria-label="Predošlý" onClick={() => onDateChange(addDays(date, -step))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="font-semibold" data-date-trigger>
              {new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long", year: "numeric" }).format(
                keyToDate(date),
              )}
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

      <div className="h-7">
        {coversToday ? (
          <span className="text-xs font-medium text-muted-foreground">DNES</span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onDateChange(todayKey(new Date()))}>
            Späť na dnes
          </Button>
        )}
      </div>
    </div>
  );
}
