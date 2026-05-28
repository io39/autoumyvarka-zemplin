import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  seedOrder,
  serviceClient,
} from "./support";

test.describe("worker — SMS templates + resend are forbidden (spec 07 §4.7)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("/settings/sms-templates renders 403 for worker", async ({ page }) => {
    await page.goto("/settings/sms-templates");
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
  });

  test("workers see SMS attempts on the order but no resend button", async ({ page }) => {
    const o = await seedOrder();
    const db = serviceClient();
    await db.from("sms_messages").insert({
      order_id: o.orderId,
      type: "ready",
      phone: "+421900111222",
      body: "test sms body",
      status: "failed",
      error: "fake-provider: forced failure",
    });

    await page.goto(`/orders/${o.orderId}`);
    const smsSection = page.locator('[data-section="sms"]');
    await expect(smsSection).toBeVisible();
    await expect(smsSection.getByText("Zlyhalo")).toBeVisible();
    await expect(
      smsSection.getByRole("button", { name: "Poslať znova" }),
    ).toHaveCount(0);
  });
});

test.describe("manager — edit templates and resend (spec 07 §4.7)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("manager can save a template (audit recorded)", async ({ page }) => {
    await page.goto("/settings/sms-templates");
    const section = page.locator('[data-template-type="ready"]');
    const textarea = section.locator("textarea");
    const newBody = `Auto je hotové (${Date.now()}). {spz}`;
    await textarea.fill(newBody);
    await section.getByRole("button", { name: "Uložiť" }).click();
    await expect(page.getByText(/Šablóna .* uložená/)).toBeVisible();

    const db = serviceClient();
    const { data: row } = await db
      .from("sms_templates")
      .select("body")
      .eq("type", "ready")
      .single();
    expect(row!.body).toBe(newBody);

    const { data: audits } = await db
      .from("audit_log")
      .select("action, details")
      .eq("action", "sms.template_save")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(audits).toHaveLength(1);
  });

  test("manager resend creates a NEW attempt; old row retained", async ({ page }) => {
    const o = await seedOrder();
    const db = serviceClient();
    const { data: original } = await db
      .from("sms_messages")
      .insert({
        order_id: o.orderId,
        type: "ready",
        phone: "+421900111333",
        body: "first attempt",
        status: "failed",
        error: "fake-provider: forced failure",
      })
      .select("id")
      .single();

    await page.goto(`/orders/${o.orderId}`);
    await page
      .locator('[data-section="sms"]')
      .getByRole("button", { name: "Poslať znova" })
      .first()
      .click();
    await expect(page.getByText("SMS znovu odoslaná.")).toBeVisible();

    const { data: all } = await db
      .from("sms_messages")
      .select("id, status")
      .eq("order_id", o.orderId)
      .order("created_at", { ascending: true });
    expect(all!.length).toBe(2);
    // Original failure row is preserved.
    expect(all![0].id).toBe(original!.id);
    expect(all![0].status).toBe("failed");

    const { data: audits } = await db
      .from("audit_log")
      .select("action")
      .eq("order_id", o.orderId)
      .eq("action", "sms.resend");
    expect(audits!.length).toBeGreaterThanOrEqual(1);
  });
});
