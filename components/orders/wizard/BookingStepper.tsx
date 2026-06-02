import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS } from "./types";

/**
 * 4-step progress indicator (UI-STRUCTURE §8). `current` is the 0-indexed active
 * step; steps before it are "done". Completed/active steps before the furthest
 * reached are clickable for back-navigation.
 */
export function BookingStepper({
  current,
  maxReached,
  onStepClick,
  subtitles,
}: {
  current: number;
  maxReached: number;
  onStepClick?: (index: number) => void;
  /** Optional context line under a step label (e.g. selected client / car). */
  subtitles?: (string | null | undefined)[];
}) {
  return (
    <ol className="flex items-center gap-1" data-stepper aria-label="Postup rezervácie">
      {WIZARD_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const reachable = i <= maxReached;
        const subtitle = subtitles?.[i];
        return (
          <li key={label} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              disabled={!reachable || !onStepClick}
              onClick={() => onStepClick?.(i)}
              data-step={i}
              data-active={active || undefined}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                active && "bg-accent font-medium text-accent-foreground",
                !active && reachable && "text-muted-foreground hover:bg-accent/60",
                !reachable && "text-muted-foreground/50",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  active && "border-primary bg-primary text-primary-foreground",
                  done && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{label}</span>
                {subtitle && (
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {subtitle}
                  </span>
                )}
              </span>
            </button>
            {i < WIZARD_STEPS.length - 1 && <span className="text-muted-foreground/40">›</span>}
          </li>
        );
      })}
    </ol>
  );
}
