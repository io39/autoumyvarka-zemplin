import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { smsWebhookSchema } from "@/lib/validation/sms";

/**
 * Provider delivery webhook (spec 07 §2.5). The only path that bypasses
 * Cloudflare Access — the provider can't authenticate to Access — so the
 * handler verifies `SMS_WEBHOOK_SECRET` itself. zod-validates the body at
 * the boundary (CLAUDE.md). Unknown `provider_message_id` → 200 + log; we
 * don't 404 because the provider would retry.
 */
export const dynamic = "force-dynamic";

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  if (!secret) return unauthorized();
  // Header-only. Query-string secrets land in CF Access / proxy / app logs;
  // if a provider truly cannot set custom headers, revisit then — don't bake
  // the leak in by default.
  const presented = req.headers.get("x-sms-webhook-secret");
  if (presented !== secret) return unauthorized();

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "malformed body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = smsWebhookSchema.parse(payload);
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message ?? "invalid payload"
        : "invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const db = getServiceClient();
  const { data: row, error: readErr } = await db
    .from("sms_messages")
    .select("id")
    .eq("provider_message_id", parsed.providerMessageId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    // Unknown id — accept and drop (provider would otherwise retry forever).
    // Log so monitoring can spot a provider/db mismatch (spec §2.5: "200 + log").
    console.warn("sms.webhook: unknown provider_message_id", {
      providerMessageId: parsed.providerMessageId,
      status: parsed.status,
    });
    return NextResponse.json({ ok: true, matched: false });
  }

  const update: {
    status: typeof parsed.status;
    delivered_at?: string;
    error?: string | null;
  } = { status: parsed.status };
  if (parsed.status === "delivered") {
    update.delivered_at = parsed.deliveredAt ?? new Date().toISOString();
    update.error = null;
  } else if (parsed.error) {
    update.error = parsed.error;
  }

  const { error: updErr } = await db
    .from("sms_messages")
    .update(update)
    .eq("id", row.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matched: true });
}
