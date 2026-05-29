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

export type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
export type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];

export type CarRow = Database["public"]["Tables"]["cars"]["Row"];
export type CarInsert = Database["public"]["Tables"]["cars"]["Insert"];

export type ClientCarRow = Database["public"]["Tables"]["client_cars"]["Row"];

export type ServiceKind = Database["public"]["Enums"]["service_kind"];

export type ServiceRow = Database["public"]["Tables"]["services"]["Row"];
export type ServiceInsert = Database["public"]["Tables"]["services"]["Insert"];

export type ServicePriceRow = Database["public"]["Tables"]["service_prices"]["Row"];
export type ServicePriceInsert = Database["public"]["Tables"]["service_prices"]["Insert"];

export type OpeningHoursRow = Database["public"]["Tables"]["opening_hours"]["Row"];
export type OpeningHoursInsert = Database["public"]["Tables"]["opening_hours"]["Insert"];

export type DayOverrideRow = Database["public"]["Tables"]["day_overrides"]["Row"];
export type DayOverrideInsert = Database["public"]["Tables"]["day_overrides"]["Insert"];

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];
export type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

export type OrderServiceRow = Database["public"]["Tables"]["order_services"]["Row"];
export type OrderServiceInsert = Database["public"]["Tables"]["order_services"]["Insert"];

export type OrderStaffRow = Database["public"]["Tables"]["order_staff"]["Row"];
export type OrderStaffInsert = Database["public"]["Tables"]["order_staff"]["Insert"];

export type WorkerRow = Database["public"]["Tables"]["workers"]["Row"];
export type WorkerInsert = Database["public"]["Tables"]["workers"]["Insert"];

export type SmsType = Database["public"]["Enums"]["sms_type"];
export type SmsStatus = Database["public"]["Enums"]["sms_status"];

export type SmsMessageRow = Database["public"]["Tables"]["sms_messages"]["Row"];
export type SmsMessageInsert = Database["public"]["Tables"]["sms_messages"]["Insert"];

export type SmsTemplateRow = Database["public"]["Tables"]["sms_templates"]["Row"];
export type SmsTemplateInsert = Database["public"]["Tables"]["sms_templates"]["Insert"];
