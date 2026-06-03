import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  seedDatedOrder,
  seedOrderFor,
  bratislavaDateOffset,
} from "./support";

test.describe("client warning flags (overdue unpaid + no-show)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("flags surface on the client detail, the order detail, and the wizard", async ({ page }) => {
    // A past 'hotová' order with an unpaid line → overdue unpaid.
    const { clientId, carId, orderId } = await seedDatedOrder({
      date: bratislavaDateOffset(-3),
      status: "hotova",
      linePaid: false,
      name: "Flag Klient",
    });
    // A no-show on the same client.
    await seedOrderFor({ clientId, carId, status: "nedostavil_sa" });

    // 1) Client detail page — badges in the header.
    await page.goto(`/clients?id=${clientId}`);
    await expect(page.locator('[data-flag="unpaid"]').first()).toContainText("Nezaplatené: 1");
    await expect(page.locator('[data-flag="no-show"]').first()).toContainText("Nedostavil sa: 1×");

    // 2) Order detail page — badges in the Klient card.
    await page.goto(`/orders/${orderId}`);
    const clientCard = page.locator('[data-section="client"]');
    await expect(clientCard.locator('[data-flag="unpaid"]')).toBeVisible();
    await expect(clientCard.locator('[data-flag="no-show"]')).toBeVisible();

    // 3) Nová rezervácia wizard prefilled with this client — banner.
    await page.goto(`/orders/new?clientId=${clientId}`);
    await expect(page.locator('[data-flag="unpaid"]').first()).toBeVisible();
    await expect(page.locator('[data-flag="no-show"]').first()).toBeVisible();
  });

  test("a clean client shows no flags", async ({ page }) => {
    const { clientId } = await seedDatedOrder({
      date: bratislavaDateOffset(-3),
      status: "zaplatena",
      linePaid: true,
      name: "Clean Klient",
    });
    await page.goto(`/clients?id=${clientId}`);
    await expect(page.locator('[data-section="history"]')).toBeVisible();
    await expect(page.locator('[data-section="client-flags"]')).toHaveCount(0);
  });
});
