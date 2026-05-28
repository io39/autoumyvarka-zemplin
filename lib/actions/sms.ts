"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/server";
import type {
  SmsMessageRow,
  SmsTemplateRow,
  SmsType,
} from "@/lib/supabase/types";
import { type ActionResult, toActionError } from "./result";
import {
  getOrderSmsSchema,
  resendSmsSchema,
  saveSmsTemplateSchema,
} from "@/lib/validation/sms";
import { dispatchOrderSms } from "@/lib/sms/dispatch";

const NOT_FOUND = "SMS sa nenašla.";

export async function getOrderSms(input: unknown): Promise<SmsMessageRow[]> {
  const { orderId } = getOrderSmsSchema.parse(input);
  await getCurrentStaff();
  const db = getServiceClient();
  const { data, error } = await db
    .from("sms_messages")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Both roles may read templates; only the manager may save (spec §1.4). */
export async function getSmsTemplates(): Promise<SmsTemplateRow[]> {
  await getCurrentStaff();
  const db = getServiceClient();
  const { data, error } = await db.from("sms_templates").select("*").order("type");
  if (error) throw error;
  return data ?? [];
}

export async function saveSmsTemplate(input: unknown): Promise<ActionResult> {
  try {
    const { type, body } = saveSmsTemplateSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: readErr } = await db
      .from("sms_templates")
      .select("body")
      .eq("type", type)
      .maybeSingle();
    if (readErr) throw readErr;

    const { error: upErr } = await db
      .from("sms_templates")
      .upsert({ type, body, updated_at: new Date().toISOString() });
    if (upErr) throw upErr;

    await writeAudit(actor, "sms.template_save", "sms_template", null, {
      type,
      from: before?.body ?? null,
      to: body,
    });

    revalidatePath("/settings/sms-templates");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Re-send a previously-attempted SMS. Spec §2.6: a resend creates a NEW
 * attempt row rather than mutating the old failure, so the history of
 * attempts is preserved. Audited as `sms.resend`.
 */
export async function resendSms(input: unknown): Promise<ActionResult<{ smsId: string }>> {
  try {
    const { smsId } = resendSmsSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: original, error: readErr } = await db
      .from("sms_messages")
      .select("order_id, type")
      .eq("id", smsId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!original) return { ok: false, message: NOT_FOUND };

    const row = await dispatchOrderSms({
      orderId: original.order_id,
      type: original.type as SmsType,
    });
    if (!row) return { ok: false, message: NOT_FOUND };

    await writeAudit(
      actor,
      "sms.resend",
      "sms_message",
      row.id,
      { original_sms_id: smsId, status: row.status },
      original.order_id,
    );

    revalidatePath(`/orders/${original.order_id}`);
    return { ok: true, smsId: row.id };
  } catch (error) {
    return toActionError(error);
  }
}
