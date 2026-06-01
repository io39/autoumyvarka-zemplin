import { cache } from "react";
import { getIdentity } from "./identity";
import { UnauthenticatedError } from "./errors";
import { getServiceClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/supabase/types";

export interface CurrentStaff {
  id: string;
  email: string;
  role: StaffRole;
  display_name: string;
}

const ROLES: readonly StaffRole[] = ["manazer", "prevadzka"];

/**
 * Apply DEV_AUTH_ROLE in dev only (architecture §2.2), and ONLY when the
 * identity came from the dev shim — never when a real Cloudflare header is
 * present (so e2e can simulate either role via the header without the override
 * masking it). Lets a solo developer test worker permissions while still using
 * a real seeded staff row (audit FK references stay valid). HARD-GUARDED:
 * never applies in production.
 */
function applyDevRoleOverride(role: StaffRole, source: "header" | "dev"): StaffRole {
  if (process.env.NODE_ENV === "production") return role;
  if (source !== "dev") return role;
  const override = process.env.DEV_AUTH_ROLE;
  if (override && (ROLES as string[]).includes(override)) return override as StaffRole;
  return role;
}

/**
 * Map the edge identity to an ACTIVE staff row → the current actor. Throws
 * UnauthenticatedError if the identity maps to no active staff member.
 *
 * Wrapped in React `cache()` so the app shell and the page it renders share a
 * single DB lookup per request (both resolve the actor — without this they'd
 * each hit the staff table). Cache is per-request, so it never leaks an actor
 * across requests or Server Action invocations.
 */
export const getCurrentStaff = cache(async (): Promise<CurrentStaff> => {
  const { email, source } = await getIdentity();

  const { data, error } = await getServiceClient()
    .from("staff")
    .select("id, email, role, display_name, active")
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new UnauthenticatedError("Identita nie je priradená k aktívnemu zamestnancovi.");

  return {
    id: data.id,
    email: data.email,
    role: applyDevRoleOverride(data.role, source),
    display_name: data.display_name,
  };
});
