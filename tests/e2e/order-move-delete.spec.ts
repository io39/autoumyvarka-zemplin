import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  seedOrder,
  serviceClient,
} from "./support";

test.describe("manager — move + delete", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("moveOrder into an occupied box/time → rejected; free slot → succeeds", async ({
    page,
  }) => {
    const occupied = await seedOrder({ box: 1, time: "11:00" });
    const target = await seedOrder({ box: 2, date: occupied.date, time: "14:00" });

    await page.goto(`/orders/${target.orderId}`);

    // Move target into Box 1 at occupied's time → conflict.
    await page.getByRole("button", { name: "Presunúť termín" }).click();
    await page.locator("#move-date").fill(occupied.date);
    await page.locator("#move-time").fill("11:00");
    await page.locator("#move-box").click();
    await page.getByRole("option", { name: "Box 1" }).click();
    await page.getByRole("button", { name: "Presunúť", exact: true }).click();
    await expect(page.getByText("Termín v tomto boxe je obsadený.")).toBeVisible();

    // Move target to Box 2 at 15:30 (free, open) → success.
    await page.getByRole("button", { name: "Presunúť termín" }).click();
    await page.locator("#move-date").fill(occupied.date);
    await page.locator("#move-time").fill("15:30");
    await page.getByRole("button", { name: "Presunúť", exact: true }).click();
    await expect(page.getByText("Termín presunutý.")).toBeVisible();
  });

  test("deleteOrder rejected on zaplatena; soft-deletes a pre-paid order; audit recorded", async ({
    page,
  }) => {
    const db = serviceClient();
    // Paid order: the trigger button must be disabled in the UI.
    const paid = await seedOrder({ status: "zaplatena" });
    await page.goto(`/orders/${paid.orderId}`);
    await expect(
      page.getByRole("button", { name: "Zrušiť objednávku" }),
    ).toBeDisabled();
    const { data: stillThere } = await db
      .from("orders")
      .select("deleted_at")
      .eq("id", paid.orderId)
      .single();
    expect(stillThere!.deleted_at).toBeNull();

    // Vytvorena → delete succeeds.
    const fresh = await seedOrder();
    await page.goto(`/orders/${fresh.orderId}`);
    await page.getByRole("button", { name: "Zrušiť objednávku" }).click();
    await page
      .getByRole("button", { name: "Zrušiť objednávku", exact: true })
      .last()
      .click();
    await expect(page.getByText("Objednávka zrušená.")).toBeVisible();

    const { data: row } = await db
      .from("orders")
      .select("deleted_at")
      .eq("id", fresh.orderId)
      .single();
    expect(row!.deleted_at).not.toBeNull();

    const { data: audit } = await db
      .from("audit_log")
      .select("action, details")
      .eq("order_id", fresh.orderId)
      .eq("action", "order.delete");
    expect(audit).toHaveLength(1);
  });
});
