import { cn } from "@/lib/utils";

// Diagonal hatch marking a closed (outside-opening-hours) band — the universal
// "unavailable" pattern, so it reads unmistakably even at a glance.
export const CLOSED_HATCH =
  "repeating-linear-gradient(45deg, rgba(113,113,122,0.22) 0, rgba(113,113,122,0.22) 5px, transparent 5px, transparent 11px)";

/**
 * A greyed, hatched closed-hours band inside a calendar box column (absolutely
 * positioned). `side` draws the boundary line at the open edge ("before" → line
 * at the bottom, "after" → line at the top). The Slovak `label` (e.g. "Mimo
 * otváracích hodín", or "Zatvorené" for a fully-closed day) only fits the wide
 * day-view columns; the week view omits it (the hatch carries the meaning).
 */
export function ClosedZone({
  top,
  height,
  side,
  label,
}: {
  top: number;
  height: number;
  side: "before" | "after";
  label?: string;
}) {
  return (
    <div
      data-closed-zone={side}
      className={cn(
        "pointer-events-none absolute inset-x-0 flex items-center justify-center overflow-hidden bg-zinc-200/70",
        side === "before" ? "border-b border-zinc-300" : "border-t border-zinc-300",
      )}
      style={{ top, height, backgroundImage: CLOSED_HATCH }}
    >
      {label && (
        <span className="px-1 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </span>
      )}
    </div>
  );
}
