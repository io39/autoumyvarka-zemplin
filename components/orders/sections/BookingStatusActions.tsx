import type { OrderStatus, StaffRole } from "@/lib/supabase/types";
import { allowedNextStatuses } from "@/lib/orders/transitions";
import { Button } from "@/components/ui/button";

const STATUS_LABEL_BUTTON: Record<OrderStatus, string> = {
  vytvorena: "Označiť ako vytvorenú",
  hotova: "Označiť ako hotovú",
  zaplatena: "Označiť ako zaplatenú",
  nedostavil_sa: "Označiť ako nedostavil sa",
};

/**
 * Bottom status-advance actions (UI-STRUCTURE §7 #10). Allowed transitions come
 * from the PRD §3 matrix via `allowedNextStatuses` (Nedostavil sa is manager-
 * only there). Both roles can advance Hotová/Zaplatená.
 */
export function BookingStatusActions({
  status,
  role,
  pending,
  onAdvance,
}: {
  status: OrderStatus;
  role: StaffRole;
  pending: boolean;
  onAdvance: (next: OrderStatus) => void;
}) {
  const nextStatuses = allowedNextStatuses(status, role);
  return (
    <section className="space-y-2 rounded-lg border p-3" data-section="status">
      <h2 className="text-sm font-medium">Stav</h2>
      <div className="flex flex-wrap items-center gap-2">
        {nextStatuses.length === 0 && (
          <span className="text-xs text-muted-foreground">
            Žiadne ďalšie akcie pre tento stav.
          </span>
        )}
        {nextStatuses.map((next) => (
          <Button
            key={next}
            size="sm"
            variant={next === "nedostavil_sa" ? "ghost" : "default"}
            disabled={pending}
            onClick={() => onAdvance(next)}
          >
            {STATUS_LABEL_BUTTON[next]}
          </Button>
        ))}
      </div>
    </section>
  );
}
