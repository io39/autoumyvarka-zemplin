import { test, expect } from "@playwright/test";
import { seedOrder, serviceClient } from "./support";

/**
 * BulkGate bulk delivery confirmations (spec 07 §2.5/§4.6).
 *
 * BulkGate cannot set custom HTTP headers on the callback, so the shared secret
 * lives in the URL path instead of the `x-sms-webhook-secret` header used by the
 * generic webhook.
 */
const SECRET = process.env.SMS_WEBHOOK_SECRET ?? "dev-sms-webhook-secret";
const URL = `/api/sms/webhook/bulkgate/${SECRET}`;

/** Seed a `sent` sms_messages row and return its provider message id. */
async function seedSentSms(suffix: string): Promise<string> {
  const o = await seedOrder();
  const db = serviceClient();
  const pid = `bulkgate-pid-${Date.now()}-${suffix}`;
  await db.from("sms_messages").insert({
    order_id: o.orderId,
    type: "ready",
    phone: "+421999111222",
    body: "test",
    status: "sent",
    provider_message_id: pid,
  });
  return pid;
}

test.describe("BulkGate delivery webhook", () => {
  test("wrong secret in the path → 401", async ({ request }) => {
    const res = await request.post("/api/sms/webhook/bulkgate/nope", {
      data: [{ status: "1", smsID: "x" }],
    });
    expect(res.status()).toBe(401);
  });

  test("payload that is not an array → 400", async ({ request }) => {
    const res = await request.post(URL, { data: { status: "1", smsID: "x" } });
    expect(res.status()).toBe(400);
  });

  test("unknown smsID → 200, no crash", async ({ request }) => {
    const res = await request.post(URL, {
      data: [{ status: "1", smsID: "missing-bulkgate-id-xyz" }],
    });
    expect(res.status()).toBe(200);
  });

  test("status 1 marks the message delivered", async ({ request }) => {
    const pid = await seedSentSms("delivered");

    const res = await request.post(URL, {
      data: [{ status: "1", smsID: pid, to: "421999111222", price: "0.03" }],
    });
    expect(res.status()).toBe(200);

    const { data: after } = await serviceClient()
      .from("sms_messages")
      .select("status, delivered_at")
      .eq("provider_message_id", pid)
      .single();
    expect(after!.status).toBe("delivered");
    expect(after!.delivered_at).not.toBeNull();
  });

  test("status 3 marks the message failed", async ({ request }) => {
    const pid = await seedSentSms("failed");

    const res = await request.post(URL, {
      data: [{ status: "3", smsID: pid }],
    });
    expect(res.status()).toBe(200);

    const { data: after } = await serviceClient()
      .from("sms_messages")
      .select("status, error")
      .eq("provider_message_id", pid)
      .single();
    expect(after!.status).toBe("failed");
    expect(after!.error).not.toBeNull();
  });

  test("status 2 (buffered) leaves the message alone — it may still arrive", async ({
    request,
  }) => {
    const pid = await seedSentSms("buffered");

    const res = await request.post(URL, { data: [{ status: "2", smsID: pid }] });
    expect(res.status()).toBe(200);

    const { data: after } = await serviceClient()
      .from("sms_messages")
      .select("status")
      .eq("provider_message_id", pid)
      .single();
    expect(after!.status).toBe("sent");
  });

  test("a batch updates every known message in it", async ({ request }) => {
    const delivered = await seedSentSms("batch-ok");
    const failed = await seedSentSms("batch-bad");

    const res = await request.post(URL, {
      data: [
        { status: "1", smsID: delivered },
        { status: "3", smsID: failed },
        { status: "1", smsID: "unknown-in-batch" },
      ],
    });
    expect(res.status()).toBe(200);

    const db = serviceClient();
    const { data: rows } = await db
      .from("sms_messages")
      .select("provider_message_id, status")
      .in("provider_message_id", [delivered, failed]);
    const byId = Object.fromEntries(
      (rows ?? []).map((r) => [r.provider_message_id, r.status]),
    );
    expect(byId[delivered]).toBe("delivered");
    expect(byId[failed]).toBe("failed");
  });
});
