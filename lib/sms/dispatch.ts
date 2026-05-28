import "server-only";

import { getServiceClient } from "@/lib/supabase/server";
import type { SmsMessageRow, SmsType } from "@/lib/supabase/types";
import { getSmsProvider } from "./provider";
import { renderTemplate, type OrderRenderContext } from "./render";

interface DispatchInput {
  orderId: string;
  type: SmsType;
}

interface OrderForSms {
  id: string;
  starts_at: string;
  client: { name: string | null; phone: string };
  car: { spz: string };
}

/**
 * Render + send a single SMS for an order, logging the attempt either way.
 * The caller never throws — a failed send is recorded as a `failed` row and
 * surfaced on the order detail (PRD §8), so a provider outage cannot block
 * the status transition (spec §2.3) or the cron batch (§2.4).
 */
export async function dispatchOrderSms(input: DispatchInput): Promise<SmsMessageRow | null> {
  const db = getServiceClient();

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select(
      "id, starts_at, client:client_id(name, phone), car:car_id(spz)",
    )
    .eq("id", input.orderId)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!order) return null;
  const o = order as unknown as OrderForSms;

  const { data: tpl, error: tplErr } = await db
    .from("sms_templates")
    .select("body")
    .eq("type", input.type)
    .maybeSingle();
  if (tplErr) throw tplErr;
  if (!tpl) return null;

  const ctx: OrderRenderContext = {
    startsAt: new Date(o.starts_at),
    spz: o.car.spz,
    clientName: o.client.name,
  };
  const body = renderTemplate(tpl.body, ctx);
  const phone = o.client.phone;

  // Log a `pending` row up-front so a process crash mid-send still leaves a
  // visible trace on the order.
  const { data: row, error: insErr } = await db
    .from("sms_messages")
    .insert({
      order_id: input.orderId,
      type: input.type,
      phone,
      body,
      status: "pending",
    })
    .select("*")
    .single();
  if (insErr) throw insErr;

  try {
    const result = await getSmsProvider().send({ to: phone, body });
    const { data: updated, error: updErr } = await db
      .from("sms_messages")
      .update({
        status: "sent",
        provider_message_id: result.providerMessageId,
        sent_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (updErr) throw updErr;
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { data: failed, error: updErr } = await db
      .from("sms_messages")
      .update({ status: "failed", error: message })
      .eq("id", row.id)
      .select("*")
      .single();
    if (updErr) {
      // The send failed AND we couldn't even record the failure. Surface it
      // so the caller (Route Handler / ORDER_READY listener) logs it instead
      // of returning a misleading `pending` row that no one will revisit.
      console.error("sms.dispatch: failed to mark sms_messages as failed", {
        smsId: row.id,
        sendError: message,
        updateError: updErr.message,
      });
    }
    return failed ?? row;
  }
}
