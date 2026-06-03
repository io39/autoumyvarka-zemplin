import type { ClientFlags } from "@/lib/orders/unpaid";
import { hasClientFlags } from "@/lib/orders/unpaid";
import { formatPriceCents } from "@/lib/services/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
        <Badge
          data-flag="unpaid"
          className="border border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          Nezaplatené: {flags.overdueUnpaidCount} · {formatPriceCents(flags.unpaidAmountCents)}
        </Badge>
      )}
      {flags.noShowCount > 0 && (
        <Badge data-flag="no-show" variant="destructive">
          Nedostavil sa: {flags.noShowCount}×
        </Badge>
      )}
    </div>
  );
}
