import type { StaffRole } from "@/lib/supabase/types";
import { UnpaidBadge } from "@/components/unpaid/unpaid-badge";
import { OutsideHoursBadge } from "@/components/outside-hours/outside-hours-badge";

const ROLE_LABEL: Record<StaffRole, string> = {
  manazer: "Manažér",
  prevadzka: "Prevádzka",
};

/**
 * Calendar header (spec 14 §2.1 / §2.6) — **mobile-only** (`md:hidden`). The row
 * is identity (left) + the manager-only badges (right): `UnpaidBadge` ("Po termíne")
 * and `OutsideHoursBadge` ("Mimo hodín"). On desktop the sidebar footer carries the
 * identity and the sidebar carries both badges, so the calendar needs no header there.
 */
export function CalendarHeader({
  role,
  staffName,
  unpaidCount,
  outsideHoursCount,
  realtimeJwt,
}: {
  role: StaffRole;
  staffName: string;
  unpaidCount: number;
  outsideHoursCount: number;
  realtimeJwt: string;
}) {
  const isManager = role === "manazer";

  return (
    <div className="flex items-center justify-between gap-2 md:hidden">
      <span className="text-sm text-muted-foreground" data-identity>
        {staffName} • {ROLE_LABEL[role]}
      </span>
      {isManager && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <UnpaidBadge initialCount={unpaidCount} realtimeJwt={realtimeJwt} />
          <OutsideHoursBadge initialCount={outsideHoursCount} realtimeJwt={realtimeJwt} />
        </div>
      )}
    </div>
  );
}
