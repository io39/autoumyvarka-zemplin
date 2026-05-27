import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import type { CurrentStaff } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Append an audit_log entry (PRD §11). Every state change records the actor
 * identity from the edge. Call AFTER the mutation it describes succeeds.
 */
export async function writeAudit(
  actor: CurrentStaff,
  action: string,
  entityType: string,
  entityId: string,
  details?: Json,
  orderId?: string,
): Promise<void> {
  const { error } = await getServiceClient().from("audit_log").insert({
    actor_email: actor.email,
    actor_staff_id: actor.id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    order_id: orderId ?? null,
    details: details ?? null,
  });
  if (error) throw error;
}
