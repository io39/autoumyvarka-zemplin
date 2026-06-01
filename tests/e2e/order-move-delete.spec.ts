import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  seedOrder,
  serviceClient,
} from "./support";

// Moving an order now happens through the wizard edit flow (spec 16); that is
// covered in booking-wizard.spec.ts. This suite keeps the delete coverage.
test.describe("manager — delete", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

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
