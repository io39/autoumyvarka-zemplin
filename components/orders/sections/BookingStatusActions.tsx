import { useId, useState } from "react";

import type { OrderStatus, StaffRole } from "@/lib/supabase/types";
import { allowedNextStatuses } from "@/lib/orders/transitions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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
  // `sendSms` is meaningful only for the vytvorená → hotová advance, which is the
  // single transition that fires the "ready" SMS; omitted for every other status.
  onAdvance: (next: OrderStatus, sendSms?: boolean) => void;
}) {
  const nextStatuses = allowedNextStatuses(status, role);
  // The "ready" SMS is sent by default; both roles may switch it off when the
  // customer is already on site (PRD §13#4 workflow).
  const [sendSms, setSendSms] = useState(true);
  const showSmsToggle = nextStatuses.includes("hotova");
  const smsToggleId = useId();
  return (
    <section className="space-y-2 rounded-lg border p-4" data-section="status">
      <h2 className="text-sm font-medium">Stav</h2>
      {showSmsToggle && (
        <label
          htmlFor={smsToggleId}
          className="flex items-center gap-2 text-sm"
          data-section="ready-sms-toggle"
        >
          <Checkbox
            id={smsToggleId}
            checked={sendSms}
            onCheckedChange={(v) => setSendSms(v === true)}
            disabled={pending}
            data-testid="ready-sms-toggle"
          />
          Odoslať SMS o dokončení
        </label>
      )}
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
            onClick={() => onAdvance(next, next === "hotova" ? sendSms : undefined)}
          >
            {STATUS_LABEL_BUTTON[next]}
          </Button>
        ))}
      </div>
    </section>
  );
}
