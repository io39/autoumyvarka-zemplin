import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  seedOrder,
  serviceClient,
} from "./support";

test.describe("note + audit", () => {
  test("manager sets a note; worker sees it but cannot edit", async ({
    browser,
  }) => {
    const o = await seedOrder();
    const db = serviceClient();

    // Manager edits the note.
    const mgrCtx = await browser.newContext({
      extraHTTPHeaders: accessHeaders(MANAGER_EMAIL),
    });
    const mgrPage = await mgrCtx.newPage();
    await mgrPage.goto(`/orders/${o.orderId}`);
    await mgrPage
      .locator('[data-section="note"]')
      .getByRole("button", { name: "Pridať" })
      .click();
    await mgrPage.locator("textarea").fill("Neotvárať stredovú konzolu.");
    await mgrPage.getByRole("button", { name: "Uložiť" }).click();
    await expect(mgrPage.getByText("Poznámka uložená.")).toBeVisible();
    await mgrCtx.close();

    // Worker sees the note rendered, no Pridať/Upraviť button.
    const wkCtx = await browser.newContext({
      extraHTTPHeaders: accessHeaders(WORKER_EMAIL),
    });
    const wkPage = await wkCtx.newPage();
    await wkPage.goto(`/orders/${o.orderId}`);
    await expect(wkPage.getByText("Neotvárať stredovú konzolu.")).toBeVisible();
    await expect(
      wkPage.locator('[data-section="note"]').getByRole("button"),
    ).toHaveCount(0);
    await wkCtx.close();

    // Audit row for the note edit.
    const { data: audits } = await db
      .from("audit_log")
      .select("action, actor_email, details")
      .eq("order_id", o.orderId)
      .eq("action", "order.note_edit");
    expect(audits).toHaveLength(1);
    expect(audits![0].actor_email).toBe(MANAGER_EMAIL);
    const details = audits![0].details as { from: string | null; to: string };
    expect(details.from).toBeNull();
    expect(details.to).toBe("Neotvárať stredovú konzolu.");
  });

  test("status_change writes audit with from/to and actor_email", async ({
    page,
  }) => {
    const o = await seedOrder();
    const db = serviceClient();

    await page.setExtraHTTPHeaders(accessHeaders(MANAGER_EMAIL));
    await page.goto(`/orders/${o.orderId}`);
    await page.getByRole("button", { name: "Označiť ako hotovú" }).click();
    await expect(page.getByText("Stav: Hotová.")).toBeVisible();

    const { data: audits } = await db
      .from("audit_log")
      .select("action, actor_email, details")
      .eq("order_id", o.orderId)
      .eq("action", "order.status_change");
    expect(audits).toHaveLength(1);
    const d = audits![0].details as { from: string; to: string };
    expect(d.from).toBe("vytvorena");
    expect(d.to).toBe("hotova");
    expect(audits![0].actor_email).toBe(MANAGER_EMAIL);
  });
});
