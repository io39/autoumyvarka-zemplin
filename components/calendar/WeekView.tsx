import Link from "next/link";
import type { CalendarBlock } from "@/lib/actions/orders";
import { bratislavaDateKey, bratislavaHHMM } from "@/lib/settings/availability";
import { ROW_PX, SLOT_MIN, diffMinutes, pad, type Interval } from "@/lib/calendar/grid";
import { cn } from "@/lib/utils";
import { BookingCard } from "./BookingCard";
import { TimeAxis } from "./TimeAxis";

const WEEKDAY_SHORT = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

// Divider + gutter marking the start of a new day so adjacent days are easy to
// tell apart on the shared time axis.
const DAY_DIVIDER = "ml-1 border-l-2 border-foreground/15 pl-1";

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
  return (
    <div className="overflow-x-auto rounded-lg border">
      <div
        className="grid min-w-[800px] gap-1 p-2"
        style={{ gridTemplateColumns: `60px repeat(${weekDays.length}, minmax(120px, 1fr))` }}
      >
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
        {weekDays.map((dk, i) => (
          <DayCell
            key={`c-${dk}`}
            dateKey={dk}
            rows={rows}
            gridInterval={interval}
            dayInterval={dayIntervals.get(dk) ?? null}
            dayStart={i > 0}
            blocks={blocks.filter((b) => bratislavaDateKey(new Date(b.order.starts_at)) === dk)}
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
  blocks,
}: {
  dateKey: string;
  rows: string[];
  gridInterval: Interval;
  dayInterval: Interval | null;
  dayStart: boolean;
  blocks: CalendarBlock[];
}) {
  const heightPx = rows.length * ROW_PX;
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
          {blocks
            .filter((b) => b.order.box === box)
            .map((b) => {
              const startHHMM = bratislavaHHMM(new Date(b.order.starts_at));
              const endHHMM = bratislavaHHMM(new Date(b.order.ends_at));
              const offsetMin = diffMinutes(gridInterval.open, startHHMM);
              const heightMin = Math.max(SLOT_MIN, diffMinutes(startHHMM, endHHMM));
              return (
                <BookingCard
                  key={b.order.id}
                  block={b}
                  density="compact"
                  className="absolute left-1 right-1 text-xs"
                  style={{
                    top: (offsetMin / SLOT_MIN) * ROW_PX,
                    height: (heightMin / SLOT_MIN) * ROW_PX - 2,
                  }}
                />
              );
            })}
        </div>
      ))}
    </div>
  );
}
