import type { CalendarBlock } from "@/lib/actions/orders";
import { ROW_PX, type Interval } from "@/lib/calendar/grid";
import { BookingBlock } from "./BookingBlock";
import { TimeAxis } from "./TimeAxis";

/**
 * Day view (spec 14 §2.7): 2 boxes side by side on `sm:+`; on mobile only the
 * `activeBox` column shows (the Box 1/Box 2 toggle lives in the header now).
 * Behavior unchanged from the original `DayGrid`.
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
  return (
    <div className="grid grid-cols-[60px_1fr] gap-1 rounded-lg border p-2 sm:grid-cols-[60px_1fr_1fr]">
      <div />
      <BoxHeader index={1} className={activeBox === 1 ? "" : "hidden sm:block"} />
      <BoxHeader index={2} className={activeBox === 2 ? "" : "hidden sm:block"} />

      <TimeAxis rows={rows} />
      <BoxColumn
        boxIndex={1}
        blocks={blocks.filter((b) => b.order.box === 1)}
        rows={rows}
        intervalOpen={interval.open}
        className={activeBox === 1 ? "" : "hidden sm:block"}
      />
      <BoxColumn
        boxIndex={2}
        blocks={blocks.filter((b) => b.order.box === 2)}
        rows={rows}
        intervalOpen={interval.open}
        className={activeBox === 2 ? "" : "hidden sm:block"}
      />
    </div>
  );
}

function BoxHeader({ index, className }: { index: number; className?: string }) {
  return (
    <div className={`text-center text-sm font-medium ${className ?? ""}`}>Box {index}</div>
  );
}

function BoxColumn({
  boxIndex,
  blocks,
  rows,
  intervalOpen,
  className,
}: {
  boxIndex: number;
  blocks: CalendarBlock[];
  rows: string[];
  intervalOpen: string;
  className?: string;
}) {
  return (
    <div
      data-box={boxIndex}
      className={`relative rounded border bg-muted/30 ${className ?? ""}`}
      style={{ height: rows.length * ROW_PX }}
    >
      {rows.map((t, i) => (
        <div
          key={t}
          className="absolute left-0 right-0 border-t border-dashed"
          style={{ top: i * ROW_PX, height: ROW_PX }}
        />
      ))}
      {blocks.map((b) => (
        <BookingBlock key={b.order.id} block={b} intervalOpen={intervalOpen} />
      ))}
    </div>
  );
}
