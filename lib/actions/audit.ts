"use server";

import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { getServiceClient } from "@/lib/supabase/server";
import { bratislavaLocalDayRange } from "@/lib/time/bratislava";
import type { AuditLogRow } from "@/lib/supabase/types";
import { getAuditLogSchema } from "@/lib/validation/audit";
import { encodeAuditCursor, decodeAuditCursor } from "@/lib/audit/cursor";

export interface AuditPage {
  entries: AuditLogRow[];
  nextCursor: string | null;
}

/**
 * Manager-only, newest-first, filterable audit list with keyset pagination
 * (spec 09). Reads via service_role behind the edge gate; RLS is deny-by-default
 * so no other path can read the log. Throws ForbiddenError for `prevadzka`.
 */
export async function getAuditLog(input: unknown): Promise<AuditPage> {
  const params = getAuditLogSchema.parse(input);
  const actor = await getCurrentStaff();
  requireManager(actor);
  const db = getServiceClient();

  const limit = params.limit ?? 50;

  // Fetch limit+1 to detect whether a further page exists without a count query.
  let q = db
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (params.from) {
    q = q.gte("created_at", bratislavaLocalDayRange(params.from).start.toISOString());
  }
  if (params.to) {
    // Inclusive `to` day → strictly before the start of the next local day.
    q = q.lt("created_at", bratislavaLocalDayRange(params.to).end.toISOString());
  }
  if (params.actions && params.actions.length > 0) {
    q = q.in("action", params.actions);
  }
  if (params.entityType) {
    q = q.eq("entity_type", params.entityType);
  }
  if (params.actorStaffId) {
    q = q.eq("actor_staff_id", params.actorStaffId);
  }
  if (params.orderId) {
    q = q.eq("order_id", params.orderId);
  }

  if (params.cursor) {
    const c = decodeAuditCursor(params.cursor);
    if (c) {
      // Row-value keyset for DESC order: created_at < cursor, OR equal-and id <.
      // Timestamp is double-quoted so the "+" in the tz offset survives the
      // PostgREST filter parser (supabase-js URL-encodes the value).
      q = q.or(
        `created_at.lt."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.lt.${c.id})`,
      );
    }
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as AuditLogRow[];
  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  const last = entries[entries.length - 1];
  const nextCursor = hasMore && last ? encodeAuditCursor(last) : null;

  return { entries, nextCursor };
}
