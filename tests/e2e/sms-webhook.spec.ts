import { test, expect } from "@playwright/test";
import { seedOrder, serviceClient } from "./support";

const SECRET = process.env.SMS_WEBHOOK_SECRET ?? "dev-sms-webhook-secret";

test.describe("SMS delivery webhook (spec 07 §4.6)", () => {
  test("missing/bad secret → 401", async ({ request }) => {
    const noSecret = await request.post("/api/sms/webhook", { data: {} });
    expect(noSecret.status()).toBe(401);

    const wrong = await request.post("/api/sms/webhook", {
      headers: { "x-sms-webhook-secret": "nope" },
      data: { providerMessageId: "x", status: "delivered" },
    });
    expect(wrong.status()).toBe(401);
  });

  test("malformed body → 400", async ({ request }) => {
    const res = await request.post("/api/sms/webhook", {
      headers: {
        "x-sms-webhook-secret": SECRET,
        "content-type": "application/json",
      },
      data: { status: "delivered" }, // missing providerMessageId
    });
    expect(res.status()).toBe(400);
  });

  test("unknown provider_message_id → 200, no crash", async ({ request }) => {
    const res = await request.post("/api/sms/webhook", {
      headers: { "x-sms-webhook-secret": SECRET },
      data: { providerMessageId: "missing-id-xyz", status: "delivered" },
    });
    expect(res.status()).toBe(200);
  });

  test("known id with status=delivered updates the row", async ({ request }) => {
    const o = await seedOrder();
    const db = serviceClient();
    const pid = `webhook-pid-${Date.now()}`;
    const { data: row } = await db
      .from("sms_messages")
      .insert({
        order_id: o.orderId,
        type: "ready",
        phone: "+421999111222",
        body: "test",
        status: "sent",
        provider_message_id: pid,
      })
      .select("id")
      .single();

    const res = await request.post("/api/sms/webhook", {
      headers: { "x-sms-webhook-secret": SECRET },
      data: { providerMessageId: pid, status: "delivered" },
    });
    expect(res.status()).toBe(200);

    const { data: after } = await db
      .from("sms_messages")
      .select("status, delivered_at")
      .eq("id", row!.id)
      .single();
    expect(after!.status).toBe("delivered");
    expect(after!.delivered_at).not.toBeNull();
  });

  test("status=failed sets error", async ({ request }) => {
    const o = await seedOrder();
    const db = serviceClient();
    const pid = `webhook-pid-${Date.now()}-fail`;
    await db
      .from("sms_messages")
      .insert({
        order_id: o.orderId,
        type: "reminder",
        phone: "+421999111222",
        body: "test",
        status: "sent",
        provider_message_id: pid,
      });

    const res = await request.post("/api/sms/webhook", {
      headers: { "x-sms-webhook-secret": SECRET },
      data: { providerMessageId: pid, status: "failed", error: "unreachable" },
    });
    expect(res.status()).toBe(200);

    const { data: after } = await db
      .from("sms_messages")
      .select("status, error")
      .eq("provider_message_id", pid)
      .single();
    expect(after!.status).toBe("failed");
    expect(after!.error).toBe("unreachable");
  });
});
