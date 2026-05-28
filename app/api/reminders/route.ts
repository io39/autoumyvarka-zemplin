import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { dispatchOrderSms } from "@/lib/sms/dispatch";
import { reminderWindow } from "@/lib/sms/reminder-window";

/**
 * Scheduled 30-minute reminder trigger (architecture §6, spec 07 §2.4).
 * pg_cron POSTs here every minute with the shared `REMINDER_TRIGGER_SECRET`.
 * The handler selects orders whose start is ~30 min out, in state
 * `vytvorena`, not deleted, and not yet reminded; sends the reminder SMS;
 * then stamps `orders.reminded_at`. Idempotent: a second invocation finds
 * nothing because `reminded_at` is set.
 *
 * Window: starts_at ∈ [now+30min-WINDOW, now+30min+WINDOW]. WINDOW = 2 min
 * matches the cron period (1 min) with a small safety margin; a duplicate
 * fire is harmless because `reminded_at` gates the second pass.
 */
export const dynamic = "force-dynamic";

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.REMINDER_TRIGGER_SECRET;
  if (!secret) return unauthorized();
  const presented = req.headers.get("x-reminder-secret");
  if (presented !== secret) return unauthorized();

  const db = getServiceClient();
  const { from, to } = reminderWindow(new Date());

  const { data: due, error } = await db
    .from("orders")
    .select("id")
    .eq("status", "vytvorena")
    .is("deleted_at", null)
    .is("reminded_at", null)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString());
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  for (const order of due ?? []) {
    // Stamp reminded_at FIRST to win idempotency races; if the send fails,
    // the failure row is still visible on the order and the manager can
    // resend manually (spec §2.6). The `WHERE reminded_at IS NULL` predicate
    // means a concurrent cron fire stamping the row first will return zero
    // affected rows here — we MUST gate on the row count, not just on the
    // absence of an SQL error, or two interleaved fires both proceed to
    // dispatch.
    const { error: stampErr, data: stamped } = await db
      .from("orders")
      .update({ reminded_at: new Date().toISOString() })
      .eq("id", order.id)
      .is("reminded_at", null)
      .select("id");
    if (stampErr) {
      failed += 1;
      continue;
    }
    if (!stamped || stamped.length === 0) {
      // Another invocation won the race; skip silently.
      continue;
    }
    try {
      const row = await dispatchOrderSms({ orderId: order.id, type: "reminder" });
      if (row?.status === "sent") sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, considered: due?.length ?? 0, sent, failed });
}
