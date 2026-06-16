import Link from "next/link";
import type { CalendarBlock } from "@/lib/actions/orders";
import { bratislavaDateKey } from "@/lib/settings/availability";
import { ROW_PX, SLOT_MIN, diffMinutes, pad, type Interval } from "@/lib/calendar/grid";
import { cn } from "@/lib/utils";
import { BookingCard } from "./BookingCard";
import { TimeAxis } from "./TimeAxis";
import { placeBoxLanes, type PlacedBlock } from "./placeLanes";

const WEEKDAY_SHORT = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

// Min lane width in the dense week grid — enough to read a (truncated) car name.
// More lanes widen the day column; the grid scrolls horizontally.
const WEEK_MIN_LANE_PX = 60;

// Thin divider centered in the gutter (a ::before placed half a gap-width into
// the gap) marking the start of a new day so adjacent days are easy to tell
// apart on the shared time axis. `gap-1` = 4px → 2px in.
const DAY_DIVIDER =
  "relative before:pointer-events-none before:absolute before:inset-y-0 before:left-[-5px] before:rounded-lg before:w-1 before:bg-foreground/30 before:content-['']";

/**
 * Week view (spec 14 §2.7): 7 days × 2 boxes on a shared time axis, horizontally
 * scrollable; per-day closed zones greyed. Behavior unchanged from `WeekGrid`.
 */
export function WeekView({
  weekDays,
  rows,
  interval,
  dayIntervals,
  blocks,
}: {
  weekDays: string[];
  rows: string[];
  interval: Interval;
  dayIntervals: Map<string, Interval | null>;
  blocks: CalendarBlock[];
}) {
  // Lane-place each day's two boxes once: drives both the per-day column width
  // (so lanes never fall below the min) and the card positions.
  const perDay = weekDays.map((dk) => {
    const dayBlocks = blocks.filter((b) => bratislavaDateKey(new Date(b.order.starts_at)) === dk);
    const box1 = placeBoxLanes(dayBlocks, 1, interval.open);
    const box2 = placeBoxLanes(dayBlocks, 2, interval.open);
    return { dateKey: dk, box1, box2, lanes: Math.max(box1.lanes, box2.lanes) };
  });

  // Each day column holds two boxes, each ≥ lanes × min-lane-width.
  const colTemplate = `60px ${perDay
    .map((d) => `minmax(${2 * d.lanes * WEEK_MIN_LANE_PX}px, 1fr)`)
    .join(" ")}`;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="grid gap-1.5 p-2" style={{ gridTemplateColumns: colTemplate }}>
        <div />
        {weekDays.map((dk, i) => (
          <DayHeader
            key={`h-${dk}`}
            dateKey={dk}
            closed={dayIntervals.get(dk) === null}
            dayStart={i > 0}
          />
        ))}

        <TimeAxis rows={rows} />
        {perDay.map((d, i) => (
          <DayCell
            key={`c-${d.dateKey}`}
            dateKey={d.dateKey}
            rows={rows}
            gridInterval={interval}
            dayInterval={dayIntervals.get(d.dateKey) ?? null}
            dayStart={i > 0}
            box1={d.box1.placed}
            box2={d.box2.placed}
          />
        ))}
      </div>
    </div>
  );
}

function DayHeader({
  dateKey,
  closed,
  dayStart,
}: {
  dateKey: string;
  closed: boolean;
  dayStart: boolean;
}) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = (probe.getUTCDay() + 6) % 7;
  const label = `${WEEKDAY_SHORT[dow]} ${pad(d)}.${pad(m)}.`;
  return (
    <Link
      href={`/?view=day&date=${dateKey}`}
      className={cn("text-center text-xs font-medium hover:underline", dayStart && DAY_DIVIDER)}
    >
      <div>{label}</div>
      <div className="text-[10px] text-muted-foreground">Box 1 · Box 2</div>
      {closed && <div className="text-[10px] text-muted-foreground">zatvorené</div>}
    </Link>
  );
}

function DayCell({
  dateKey,
  rows,
  gridInterval,
  dayInterval,
  dayStart,
  box1,
  box2,
}: {
  dateKey: string;
  rows: string[];
  gridInterval: Interval;
  dayInterval: Interval | null;
  dayStart: boolean;
  box1: PlacedBlock[];
  box2: PlacedBlock[];
}) {
  const heightPx = rows.length * ROW_PX;
  const placedFor = (box: 1 | 2) => (box === 1 ? box1 : box2);
  // Mask the portion of the cell that lies outside this day's open interval.
  const closedTop = dayInterval
    ? Math.max(0, (diffMinutes(gridInterval.open, dayInterval.open) / SLOT_MIN) * ROW_PX)
    : heightPx;
  const closedBottomStart = dayInterval
    ? (diffMinutes(gridInterval.open, dayInterval.close) / SLOT_MIN) * ROW_PX
    : 0;

  return (
    <div
      className={cn("grid grid-cols-2 gap-0.5", dayStart && DAY_DIVIDER)}
      data-day={dateKey}
      style={{ height: heightPx }}
    >
      {[1, 2].map((box) => (
        <div key={box} className="relative rounded border bg-muted/30" data-box={box}>
          {rows.map((t, i) => (
            <div
              key={t}
              className={cn(
                "absolute left-0 right-0 border-t border-dashed border-muted-foreground/25",
                (t.endsWith(":00") || t.endsWith(":30")) && "border-muted-foreground/40",
              )}
              style={{ top: i * ROW_PX, height: ROW_PX }}
            />
          ))}
          {/* Greyed-out closed zones (top + bottom). */}
          {closedTop > 0 && (
            <div
              className="absolute left-0 right-0 bg-zinc-200/70"
              style={{ top: 0, height: closedTop }}
            />
          )}
          {dayInterval && closedBottomStart < heightPx && (
            <div
              className="absolute left-0 right-0 bg-zinc-200/70"
              style={{ top: closedBottomStart, bottom: 0 }}
            />
          )}
          {!dayInterval && (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
              zatvorené
            </div>
          )}
          {placedFor(box as 1 | 2).map((p) => {
            const heightMin = Math.max(SLOT_MIN, p.endMin - p.startMin);
            return (
              <BookingCard
                key={p.block.order.id}
                block={p.block}
                density="compact"
                className="absolute text-xs"
                style={{
                  top: (p.startMin / SLOT_MIN) * ROW_PX,
                  height: (heightMin / SLOT_MIN) * ROW_PX - 2,
                  left: `calc(${(p.lane / p.lanes) * 100}% + 1px)`,
                  width: `calc(${100 / p.lanes}% - 2px)`,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
