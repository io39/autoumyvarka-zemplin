/**
 * Convenience aliases derived from the generated schema types
 * (`database.types.ts`, produced by `supabase gen types typescript --local`).
 * Regenerate that file after every migration; do not hand-edit it.
 */
import type { Database } from "./database.types";

export type { Database };

export type StaffRole = Database["public"]["Enums"]["staff_role"];
export type PricingCategory = Database["public"]["Enums"]["pricing_category"];
export type OrderStatus = Database["public"]["Enums"]["order_status"];

export type StaffRow = Database["public"]["Tables"]["staff"]["Row"];
export type StaffInsert = Database["public"]["Tables"]["staff"]["Insert"];
export type StaffUpdate = Database["public"]["Tables"]["staff"]["Update"];

export type AuditLogRow = Database["public"]["Tables"]["audit_log"]["Row"];
export type AuditLogInsert = Database["public"]["Tables"]["audit_log"]["Insert"];
