import type { OrderStatus, StaffRole } from "@/lib/supabase/types";

/**
 * Allowed status transitions (spec 06 §2.2 / PRD §6). One central matrix —
 * Server Actions call canTransition() before writing; the UI uses it to gate
 * action buttons. The `nedostavil_sa → vytvorena` edge is the approved
 * exception for a late-arriving client (manager only; slot is re-checked at
 * the action layer).
 */
export type AllowedRoles = readonly StaffRole[];

const TRANSITIONS: Readonly<
  Partial<Record<OrderStatus, Partial<Record<OrderStatus, AllowedRoles>>>>
> = {
  vytvorena: {
    hotova: ["manazer", "prevadzka"],
    nedostavil_sa: ["manazer"],
  },
  hotova: {
    // Spec 06 §1.4 (PRD §3 matrix, authoritative) + §4.2 acceptance both
    // list `zaplatená` as a both-role action. The §2.2 ASCII diagram is
    // less precise on this edge; matrix wins.
    zaplatena: ["manazer", "prevadzka"],
  },
  nedostavil_sa: {
    // Late-arrival exception (spec 06 §2.2). Re-checks conflict + hours.
    vytvorena: ["manazer"],
  },
  // `zaplatena` is terminal — no outgoing edges.
};

export function canTransition(
  from: OrderStatus,
  next: OrderStatus,
  role: StaffRole,
): boolean {
  const row = TRANSITIONS[from];
  if (!row) return false;
  const allowedRoles = row[next];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}

/** All next statuses the role may transition to from `from`. UI helper. */
export function allowedNextStatuses(from: OrderStatus, role: StaffRole): OrderStatus[] {
  const row = TRANSITIONS[from];
  if (!row) return [];
  return (Object.entries(row) as [OrderStatus, AllowedRoles][])
    .filter(([, roles]) => roles.includes(role))
    .map(([next]) => next);
}
