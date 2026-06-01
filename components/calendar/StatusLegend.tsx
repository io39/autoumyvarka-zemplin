import type { OrderStatus } from "@/lib/supabase/types";
import { STATE_COLOR, STATE_LABEL } from "@/types";

/** Order of the four statuses in the legend. */
const LEGEND_ORDER: OrderStatus[] = ["vytvorena", "hotova", "zaplatena", "nedostavil_sa"];

/** Shortened labels for narrow screens (shown, not hidden — UI-STRUCTURE §4). */
const SHORT_LABEL: Record<OrderStatus, string> = {
  vytvorena: "Vytv.",
  hotova: "Hot.",
  zaplatena: "Zapl.",
  nedostavil_sa: "Nedost.",
};

/**
 * Color legend above the grid (spec 14 §2.4). Reads from spec 13's
 * `STATE_COLOR` (`badge` dot) + `STATE_LABEL`. Full labels on `sm:+`, shortened
 * labels on mobile.
 */
export function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-status-legend>
      {LEGEND_ORDER.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${STATE_COLOR[s].badge}`} aria-hidden />
          <span className="sm:hidden">{SHORT_LABEL[s]}</span>
          <span className="hidden sm:inline">{STATE_LABEL[s]}</span>
        </span>
      ))}
    </div>
  );
}
