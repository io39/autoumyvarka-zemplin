import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, seedClientWithCar, seedOrderFor } from "./support";

test.describe("order detail — História klienta box (spec 15)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("lists the client's other visits (newest-first), each linking to its order", async ({
    page,
  }) => {
    const { clientId, carId } = await seedClientWithCar();
    const past = await seedOrderFor({ clientId, carId, status: "zaplatena" });
    const current = await seedOrderFor({ clientId, carId, status: "vytvorena" });

    await page.goto(`/orders/${current.orderId}`);
    const box = page.locator('[data-section="client-history"]');
    await expect(box).toBeVisible();

    // The other order shows; the current order is excluded.
    await expect(box.locator(`[data-order-id="${past.orderId}"]`)).toBeVisible();
    await expect(box.locator(`[data-order-id="${current.orderId}"]`)).toHaveCount(0);

    // "Celá história →" points at the client page.
    await expect(box.getByRole("link", { name: /Celá história/ })).toHaveAttribute(
      "href",
      new RegExp(`/clients\\?id=${clientId}`),
    );

    // A visit row links to that order.
    await box.locator(`[data-order-id="${past.orderId}"]`).click();
    await page.waitForURL(new RegExp(`/orders/${past.orderId}$`));
  });

  test("empty state when the client has no other visits", async ({ page }) => {
    const { clientId, carId } = await seedClientWithCar();
    const only = await seedOrderFor({ clientId, carId, status: "vytvorena" });

    await page.goto(`/orders/${only.orderId}`);
    const box = page.locator('[data-section="client-history"]');
    await expect(box.getByText("Žiadne predošlé návštevy.")).toBeVisible();
    await expect(box.getByRole("link", { name: /Celá história/ })).toBeVisible();
    void clientId;
  });
});
