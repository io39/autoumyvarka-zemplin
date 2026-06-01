import Link from "next/link";
import type { CalendarBlock } from "@/lib/actions/orders";
import { bratislavaHHMM } from "@/lib/settings/availability";
import { ROW_PX, SLOT_MIN, diffMinutes } from "@/lib/calendar/grid";
import { STATE_COLOR } from "@/types";
import { Badge } from "@/components/ui/badge";

/**
 * One order block on the calendar grid. Stays a `Link` to `/orders/[id]` — spec
 * 15 swaps it for the popup Sheet trigger. Behavior unchanged from the original
 * inline `Block`.
 */
export function BookingBlock({
  block,
  intervalOpen,
  compact,
}: {
  block: CalendarBlock;
  intervalOpen: string;
  compact?: boolean;
}) {
  const start = new Date(block.order.starts_at);
  const end = new Date(block.order.ends_at);
  const startHHMM = bratislavaHHMM(start);
  const endHHMM = bratislavaHHMM(end);
  const offsetMin = diffMinutes(intervalOpen, startHHMM);
  const heightMin = Math.max(15, diffMinutes(startHHMM, endHHMM));
  const style = STATE_COLOR[block.order.status];

  const mainService = block.services.find((s) => !s.removed_at)?.name_snapshot ?? "—";

  return (
    <Link
      href={`/orders/${block.order.id}`}
      data-order-id={block.order.id}
      className={`absolute left-1 right-1 rounded border px-1 py-0.5 text-xs transition-opacity hover:opacity-90 ${style.bg} ${style.border} ${style.text}`}
      style={{
        top: (offsetMin / SLOT_MIN) * ROW_PX,
        height: (heightMin / SLOT_MIN) * ROW_PX - 2,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-medium">{block.car.spz}</span>
        {!compact && (
          <Badge variant="secondary" className="text-[10px]">
            {startHHMM}–{endHHMM}
          </Badge>
        )}
      </div>
      {compact ? (
        <div className="truncate text-[10px] opacity-80">
          {startHHMM}–{endHHMM}
        </div>
      ) : (
        <>
          {block.car.model && (
            <div className="truncate text-[11px] opacity-80">{block.car.model}</div>
          )}
          <div className="truncate text-[11px]">{mainService}</div>
        </>
      )}
    </Link>
  );
}
