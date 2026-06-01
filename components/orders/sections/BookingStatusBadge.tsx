import type { OrderStatus } from "@/lib/supabase/types";
import { STATE_COLOR, STATE_LABEL } from "@/types";
import { Badge } from "@/components/ui/badge";

/** Colored status badge (UI-STRUCTURE §7 #2). */
export function BookingStatusBadge({ status }: { status: OrderStatus }) {
  const s = STATE_COLOR[status];
  return (
    <Badge className={`border ${s.bg} ${s.border} ${s.text}`} data-status={status}>
      {STATE_LABEL[status]}
    </Badge>
  );
}
