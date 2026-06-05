import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, seedClientWithCar, seedOrderFor } from "./support";

test.describe("order detail — História auta box (spec 15)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("lists the car's other visits (newest-first), each linking to its order", async ({
    page,
  }) => {
    const { clientId, carId } = await seedClientWithCar();
    const past = await seedOrderFor({ clientId, carId, status: "zaplatena" });
    const current = await seedOrderFor({ clientId, carId, status: "vytvorena" });

    await page.goto(`/orders/${current.orderId}`);
    const box = page.locator('[data-section="car-history"]');
    await expect(box).toBeVisible();

    // The other order shows; the current order is excluded.
    await expect(box.locator(`[data-order-id="${past.orderId}"]`)).toBeVisible();
    await expect(box.locator(`[data-order-id="${current.orderId}"]`)).toHaveCount(0);

    // "Celá história →" points at the current client's page.
    await expect(box.getByRole("link", { name: /Celá história/ })).toHaveAttribute(
      "href",
      new RegExp(`/clients\\?id=${clientId}`),
    );

    // A visit row links to that order.
    await box.locator(`[data-order-id="${past.orderId}"]`).click();
    await page.waitForURL(new RegExp(`/orders/${past.orderId}$`));
  });

  test("shows another client's visit on the SAME (shared) car", async ({ page }) => {
    // One car, two clients. The box is scoped by car, so client B's visit must
    // appear when viewing client A's order on that car (the whole point: see
    // what was done on the car, not on one owner).
    const a = await seedClientWithCar();
    const b = await seedClientWithCar();
    const otherClientVisit = await seedOrderFor({
      clientId: b.clientId,
      carId: a.carId, // B's order on A's car
      status: "zaplatena",
    });
    const current = await seedOrderFor({
      clientId: a.clientId,
      carId: a.carId,
      status: "vytvorena",
    });

    await page.goto(`/orders/${current.orderId}`);
    const box = page.locator('[data-section="car-history"]');
    await expect(box.locator(`[data-order-id="${otherClientVisit.orderId}"]`)).toBeVisible();
  });

  test("empty state when the car has no other visits", async ({ page }) => {
    const { clientId, carId } = await seedClientWithCar();
    const only = await seedOrderFor({ clientId, carId, status: "vytvorena" });

    await page.goto(`/orders/${only.orderId}`);
    const box = page.locator('[data-section="car-history"]');
    await expect(box.getByText("Žiadne predošlé návštevy.")).toBeVisible();
    await expect(box.getByRole("link", { name: /Celá história/ })).toBeVisible();
    void clientId;
  });
});
