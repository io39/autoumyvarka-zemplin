import { cn } from "@/lib/utils";
import { ROW_PX } from "@/lib/calendar/grid";

/**
 * Left-hand time gutter — one cell per 15-min row (keeps grid lines aligned), but
 * only the :00 / :30 marks are labelled. Hour/half-hour lines are higher-contrast.
 */
export function TimeAxis({ rows }: { rows: string[] }) {
  return (
    <div className="text-xs text-muted-foreground" data-axis>
      {rows.map((t) => {
        const onHalf = t.endsWith(":00") || t.endsWith(":30");
        return (
          <div
            key={t}
            style={{ height: ROW_PX }}
            className={cn(
              "border-t border-dashed border-muted-foreground/25 pr-1 text-right leading-none first:border-t-0",
              onHalf && "border-muted-foreground/40",
              t.endsWith(":00") && "font-medium text-foreground/70",
            )}
          >
            {onHalf ? t : ""}
          </div>
        );
      })}
    </div>
  );
}
