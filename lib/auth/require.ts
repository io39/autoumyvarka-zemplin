import { ForbiddenError } from "./errors";
import type { CurrentStaff } from "./session";
import type { StaffRole } from "@/lib/supabase/types";

/**
 * Assert that `staff` holds the required role; throw ForbiddenError otherwise.
 * Pure (takes the already-resolved actor) so it is trivially unit-testable and
 * so callers resolve the actor exactly once per action.
 *
 * Every mutating Server Action calls requireRole/requireManager FIRST, before
 * any DB write (CLAUDE.md, edge-auth skill).
 */
export function requireRole(staff: CurrentStaff, role: StaffRole): CurrentStaff {
  if (staff.role !== role) throw new ForbiddenError();
  return staff;
}

export function requireManager(staff: CurrentStaff): CurrentStaff {
  return requireRole(staff, "manazer");
}
