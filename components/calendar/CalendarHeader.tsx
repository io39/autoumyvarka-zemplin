import Link from "next/link";
import type { StaffRole } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { UnpaidBadge } from "@/components/unpaid/unpaid-badge";

const ROLE_LABEL: Record<StaffRole, string> = {
  manazer: "Manažér",
  prevadzka: "Prevádzka",
};

/**
 * Calendar header actions (spec 14 §2.1 / §2.6). Right-aligned on desktop:
 * the manager-only `UnpaidBadge` + a `Nová rezervácia` button. On mobile the
 * actions stack: identity (left) + unpaid (right) on one line, then a
 * full-width `Nová rezervácia` below.
 *
 * The whole row is **mobile-only** (`md:hidden`): on desktop the sidebar footer
 * carries the identity and the sidebar carries the `UnpaidBadge`, so the calendar
 * needs no header there at all.
 */
export function CalendarHeader({
  date,
  role,
  staffName,
  unpaidCount,
  realtimeJwt,
}: {
  date: string;
  role: StaffRole;
  staffName: string;
  unpaidCount: number;
  realtimeJwt: string;
}) {
  const isManager = role === "manazer";

  return (
    <div className="flex flex-col gap-2 md:hidden">
      {/* On mobile this is its own row (identity left, badge right). On desktop
          `md:contents` dissolves it so the badge flows into the right-aligned
          row beside the button and the hidden identity leaves no empty gap. */}
      <div className="flex items-center justify-between gap-2 md:contents">
        <span className="text-sm text-muted-foreground md:hidden" data-identity>
          {staffName} • {ROLE_LABEL[role]}
        </span>
        {isManager && <UnpaidBadge initialCount={unpaidCount} realtimeJwt={realtimeJwt} />}
      </div>
      {/* <Button asChild className="w-full md:w-auto">
        <Link href={`/orders/new?date=${date}`}>Nová rezervácia</Link>
      </Button> */}
    </div>
  );
}
