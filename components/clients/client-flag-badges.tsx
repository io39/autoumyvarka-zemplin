import type { ClientFlags } from "@/lib/orders/unpaid";
import { hasClientFlags } from "@/lib/orders/unpaid";
import { formatPriceCents } from "@/lib/services/format";
import { STATE_COLOR } from "@/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Both warning badges use the same look as the "Vytvorená" status badge (red),
// for visual consistency across the app.
const FLAG_BADGE = cn(
  "border",
  STATE_COLOR.vytvorena.bg,
  STATE_COLOR.vytvorena.border,
  STATE_COLOR.vytvorena.text,
);

/**
 * Warning badges for a "problematic" client: overdue-unpaid orders (amber, with
 * the amount owed) and no-shows (red). Renders nothing when the client is clean,
 * so callers can drop it in unconditionally. Shared by the booking wizard, the
 * client detail header and the order-detail Klient card.
 */
export function ClientFlagBadges({
  flags,
  className,
}: {
  flags: ClientFlags;
  className?: string;
}) {
  if (!hasClientFlags(flags)) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)} data-section="client-flags">
      {flags.overdueUnpaidCount > 0 && (
        <Badge data-flag="unpaid" className={FLAG_BADGE}>
          Nezaplatené: {flags.overdueUnpaidCount}x: {formatPriceCents(flags.unpaidAmountCents)}
        </Badge>
      )}
      {flags.noShowCount > 0 && (
        <Badge data-flag="no-show" className={FLAG_BADGE}>
          Nedostavil sa: {flags.noShowCount}×
        </Badge>
      )}
    </div>
  );
}
