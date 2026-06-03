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
 * NB on the line signal: advancing an order to `zaplatena` (spec 06 `setStatus`)
 * **cascades all non-removed lines to `paid = true`**, so a paid order is settled
 * without per-line ticking. A line added *after* payment defaults to `paid=false`
 * (the post-hoc workflow, PRD §9.3) and re-surfaces the order until ticked.
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

/** Per-client warning summary surfaced in the wizard, client card and order detail. */
export interface ClientFlags {
  /** Count of the client's overdue (past-due) unpaid orders. */
  overdueUnpaidCount: number;
  /** Sum (cents) owed across those overdue unpaid orders. */
  unpaidAmountCents: number;
  /** Count of the client's no-show (nedostavil sa) orders. */
  noShowCount: number;
}

/**
 * Reduce a client's orders to the warning flags. Overdue-unpaid uses the same
 * `isOverdue` definition as the /unpaid view; no-shows are any non-deleted
 * `nedostavil_sa`. A client with no flags has all-zero counts (`hasClientFlags`
 * is false).
 */
export function computeClientFlags(orders: UnpaidOrderInput[], todayKey: string): ClientFlags {
  let overdueUnpaidCount = 0;
  let amount = 0;
  let noShowCount = 0;
  for (const o of orders) {
    if (o.deleted_at !== null) continue;
    if (o.status === "nedostavil_sa") {
      noShowCount += 1;
      continue;
    }
    if (isOverdue(o, todayKey)) {
      overdueUnpaidCount += 1;
      amount += unpaidAmountCents(o);
    }
  }
  return { overdueUnpaidCount, unpaidAmountCents: amount, noShowCount };
}

export function hasClientFlags(f: ClientFlags): boolean {
  return f.overdueUnpaidCount > 0 || f.noShowCount > 0;
}
