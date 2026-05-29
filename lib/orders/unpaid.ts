import type { OrderStatus } from "@/lib/supabase/types";
import { bratislavaDateKey } from "@/lib/settings/availability";

/**
 * Unpaid / overdue definition (spec 10 §1.2). The **one design decision to
 * confirm with the client**, isolated here so it's easy to tune.
 *
 * An order is unpaid when it is not fully settled:
 *   - `status = 'hotova'` (washed, not yet marked `zaplatena`), OR
 *   - it has any non-removed `order_services` line with `paid = false`
 *     (covers post-hoc services added to an otherwise-paid order — PRD §9.3).
 * Excluded: `vytvorena` (nothing owed yet), `nedostavil_sa`, soft-deleted.
 *
 * NB on the line signal: marking an order `zaplatena` (spec 06 `setStatus`)
 * does NOT cascade lines to `paid`, and lines default `paid=false`. So a
 * `zaplatena` order only counts as settled once its lines are individually
 * marked paid (`setOrderServicePaid`). That is the intended per-line workflow
 * (PRD §9.3); if the client instead wants `zaplatena` alone to mean "settled",
 * drop the line check for `zaplatena` here — a one-line change.
 */

export interface UnpaidLineInput {
  paid: boolean;
  removed_at: string | null;
  price_cents_snapshot: number;
}

export interface UnpaidOrderInput {
  status: OrderStatus;
  deleted_at: string | null;
  starts_at: string;
  services: UnpaidLineInput[];
}

export function isUnpaid(
  o: Pick<UnpaidOrderInput, "status" | "deleted_at" | "services">,
): boolean {
  if (o.deleted_at !== null) return false;
  if (o.status === "vytvorena" || o.status === "nedostavil_sa") return false;
  if (o.status === "hotova") return true;
  return o.services.some((l) => l.removed_at === null && !l.paid);
}

/** Unpaid AND its local start date is before `todayKey` (Europe/Bratislava). */
export function isOverdue(o: UnpaidOrderInput, todayKey: string): boolean {
  if (!isUnpaid(o)) return false;
  // YYYY-MM-DD keys sort lexicographically, so a string compare is the date compare.
  return bratislavaDateKey(new Date(o.starts_at)) < todayKey;
}

/** Display-only sum (cents) of the non-removed, unpaid lines. */
export function unpaidAmountCents(o: Pick<UnpaidOrderInput, "services">): number {
  return o.services
    .filter((l) => l.removed_at === null && !l.paid)
    .reduce((sum, l) => sum + l.price_cents_snapshot, 0);
}
