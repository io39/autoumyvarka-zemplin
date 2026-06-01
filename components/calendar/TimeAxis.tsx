import { ROW_PX } from "@/lib/calendar/grid";

/** Left-hand time gutter — one label per 15-min row, hour/half-hour labelled. */
export function TimeAxis({ rows }: { rows: string[] }) {
  return (
    <div className="text-xs text-muted-foreground" data-axis>
      {rows.map((t) => (
        <div
          key={t}
          style={{ height: ROW_PX }}
          className="border-t border-dashed pr-1 text-right first:border-t-0"
        >
          {t.endsWith(":00") || t.endsWith(":30") ? t : ""}
        </div>
      ))}
    </div>
  );
}
