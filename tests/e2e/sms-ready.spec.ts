import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  seedOrder,
  serviceClient,
} from "./support";

test.describe("'ready' SMS dispatch on vytvorena → hotova (spec 07 §4.4)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("successful send: status hotova, sms row 'sent'", async ({ page }) => {
    const o = await seedOrder();
    await page.goto(`/orders/${o.orderId}`);
    await page.getByRole("button", { name: "Označiť ako hotovú" }).click();
    await expect(page.getByText("Stav: Hotová.")).toBeVisible();

    const db = serviceClient();
    const { data: order } = await db
      .from("orders")
      .select("status")
      .eq("id", o.orderId)
      .single();
    expect(order!.status).toBe("hotova");

    // Wait briefly for the post-commit emit to finish writing the row.
    let sms: { type: string; status: string }[] | null = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await db
        .from("sms_messages")
        .select("type, status")
        .eq("order_id", o.orderId);
      if (data && data.length > 0) {
        sms = data;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(sms).not.toBeNull();
    expect(sms!.length).toBe(1);
    expect(sms![0].type).toBe("ready");
    expect(sms![0].status).toBe("sent");
  });

  test("toggle off: status hotova, no sms row, audit records suppression", async ({ page }) => {
    const o = await seedOrder();
    await page.goto(`/orders/${o.orderId}`);

    // The toggle is checked by default; uncheck it to suppress the "ready" SMS.
    const toggle = page.getByTestId("ready-sms-toggle");
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();

    await page.getByRole("button", { name: "Označiť ako hotovú" }).click();
    await expect(page.getByText("Stav: Hotová.")).toBeVisible();

    const db = serviceClient();
    const { data: order } = await db
      .from("orders")
      .select("status")
      .eq("id", o.orderId)
      .single();
    expect(order!.status).toBe("hotova");

    // Give any (erroneous) async emit a chance to write, then assert none did.
    await new Promise((r) => setTimeout(r, 1000));
    const { data: sms } = await db
      .from("sms_messages")
      .select("id")
      .eq("order_id", o.orderId);
    expect(sms ?? []).toHaveLength(0);

    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("order_id", o.orderId)
      .eq("action", "order.status_change");
    const suppressed = (audit ?? []).some(
      (r) => (r.details as { sms_suppressed?: boolean })?.sms_suppressed === true,
    );
    expect(suppressed).toBe(true);

    // The SMS block shows the not-sent entry; "Odoslať" dispatches it after all.
    const unsent = page.locator('[data-sms-id="ready-unsent"]');
    await expect(unsent).toBeVisible();
    await expect(unsent.getByText("Neodoslaná")).toBeVisible();
    await unsent.getByRole("button", { name: "Odoslať" }).click();
    await expect(page.getByText("SMS odoslaná.")).toBeVisible();

    let ready: { type: string; status: string }[] | null = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await db
        .from("sms_messages")
        .select("type, status")
        .eq("order_id", o.orderId);
      if (data && data.length > 0) {
        ready = data;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ready).not.toBeNull();
    expect(ready!.length).toBe(1);
    expect(ready![0].type).toBe("ready");
    expect(ready![0].status).toBe("sent");

    const { data: sendAudit } = await db
      .from("audit_log")
      .select("id")
      .eq("order_id", o.orderId)
      .eq("action", "sms.send");
    expect((sendAudit ?? []).length).toBe(1);
  });

  test("failed adapter: order still hotova, sms row 'failed' with error", async ({ page }) => {
    const o = await seedOrder();
    const db = serviceClient();
    // Force the fake adapter to throw: the FakeProvider treats any number
    // ending in `999000000` as a hard failure (lib/sms/provider.ts). We
    // randomize the prefix so re-runs against a non-reset DB don't collide
    // on the `clients_phone_key` unique index.
    const magic = `+421${Math.floor(Math.random() * 1e3)
      .toString()
      .padStart(3, "0")}999000000`;
    const { error: upErr } = await db
      .from("clients")
      .update({ phone: magic })
      .eq("id", o.clientId);
    expect(upErr).toBeNull();
    const { data: clientCheck } = await db
      .from("clients")
      .select("phone")
      .eq("id", o.clientId)
      .single();
    expect(clientCheck!.phone).toBe(magic);

    await page.goto(`/orders/${o.orderId}`);
    await page.getByRole("button", { name: "Označiť ako hotovú" }).click();
    await expect(page.getByText("Stav: Hotová.")).toBeVisible();

    const { data: order } = await db
      .from("orders")
      .select("status")
      .eq("id", o.orderId)
      .single();
    // SMS failure must NOT block the status transition (spec §2.3).
    expect(order!.status).toBe("hotova");

    let sms: { status: string; error: string | null; phone: string }[] | null = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await db
        .from("sms_messages")
        .select("status, error, phone")
        .eq("order_id", o.orderId);
      if (data && data.length > 0) {
        sms = data;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(sms).not.toBeNull();
    expect(sms![0].phone).toBe(magic);
    expect(sms![0].status).toBe("failed");
    expect(sms![0].error).toContain("forced failure");
  });
});
