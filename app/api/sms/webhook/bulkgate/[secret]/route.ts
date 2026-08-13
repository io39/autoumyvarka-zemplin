import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { mapDeliveryStatus, parseDeliveryReports } from "@/lib/sms/delivery-report";

/**
 * BulkGate delivery confirmations (spec 07 §2.5). Like the generic webhook, this
 * bypasses Cloudflare Access — a provider cannot authenticate to Access.
 *
 * **Why the secret is in the URL path.** BulkGate's callback cannot set custom HTTP
 * headers, so the `x-sms-webhook-secret` header used by `../route.ts` is not an
 * option; the shared secret is a path segment instead. This deliberately reverses
 * that handler's "no secrets in the URL" stance because the provider leaves no
 * alternative. Consequence: the secret appears in Cloudflare/proxy access logs, so
 * treat it as lower-grade than a header secret and rotate it if those logs are
 * shared. The blast radius is bounded — the only thing this route can do is set a
 * delivery status on an sms_messages row that already exists.
 *
 * Enable "Bulk DLRs — bulk request" in the BulkGate portal so reports arrive as a
 * POST with a JSON array; leave "Report only when error occurs" off, or we never
 * learn about successful deliveries.
 */
export const dynamic = "force-dynamic";

/** BulkGate retries on a non-2xx, so only genuine integration faults get one. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> },
): Promise<NextResponse> {
  const expected = process.env.SMS_WEBHOOK_SECRET;
  const { secret } = await params;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "malformed body" }, { status: 400 });
  }

  let reports;
  try {
    reports = parseDeliveryReports(payload);
  } catch {
    // Not an array at all — a real integration mismatch (bulk DLRs switched off?),
    // worth failing loudly rather than silently discarding delivery state.
    return NextResponse.json({ error: "expected an array of reports" }, { status: 400 });
  }

  const delivered: string[] = [];
  const failed: string[] = [];
  for (const report of reports) {
    const status = mapDeliveryStatus(report.status);
    if (status === "delivered") delivered.push(report.smsID);
    else if (status === "failed") failed.push(report.smsID);
    // null → non-terminal (buffered) or unrelated (incoming SMS, Viber seen):
    // leave the row as-is, a later report may still conclude it.
  }

  const db = getServiceClient();
  let matched = 0;

  if (delivered.length > 0) {
    const { data, error } = await db
      .from("sms_messages")
      .update({ status: "delivered", delivered_at: new Date().toISOString(), error: null })
      .in("provider_message_id", delivered)
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    matched += data?.length ?? 0;
  }

  if (failed.length > 0) {
    const { data, error } = await db
      .from("sms_messages")
      .update({ status: "failed", error: "Nedoručené (BulkGate status 3)" })
      // Reports can arrive out of order; never walk a delivered message back.
      .neq("status", "delivered")
      .in("provider_message_id", failed)
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    matched += data?.length ?? 0;
  }

  const expectedMatches = delivered.length + failed.length;
  if (matched < expectedMatches) {
    // Ids we've never seen. Accept anyway (a non-2xx would make BulkGate retry the
    // whole batch forever) but log, since a systematic mismatch would mean the
    // `sms_id` we store is not the `smsID` they report against.
    console.warn("sms.webhook.bulkgate: unmatched delivery reports", {
      received: expectedMatches,
      matched,
    });
  }

  return NextResponse.json({ ok: true, matched });
}
