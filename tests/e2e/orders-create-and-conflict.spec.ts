import { test, expect, type Page } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  nextWeekdayDate,
  pickAFreeSlot,
  seedClientWithCar,
  seedOrder,
  serviceClient,
  wizardGoToDate,
} from "./support";

/** Drive the wizard from the car step (step 2) through to step 4. */
async function wizardToTermin(page: Page, serviceName = "Interiér Classic") {
  await page.locator('[data-step="car"] [data-car-id]').first().click();
  await page.getByRole("button", { name: "Ďalej" }).click();
  // Select a known main service that has an "os" price.
  await page.locator('[data-step="services"] label[data-service-id]', { hasText: serviceName }).click();
  await expect(page.locator("[data-summary-duration]")).toContainText("min");
  await page.getByRole("button", { name: "Ďalej" }).click();
}

test.describe("manager — booking flow (wizard)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("creates an order via the wizard; it lands on the calendar", async ({ page }) => {
    const { clientId } = await seedClientWithCar();
    const db = serviceClient();

    await page.goto(`/orders/new?clientId=${clientId}`);
    await wizardToTermin(page);
    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Vytvoriť rezerváciu" }).click();

    await expect(page.getByText("Objednávka vytvorená.")).toBeVisible();
    await expect(page).toHaveURL(/\/\?date=\d{4}-\d{2}-\d{2}/);

    const { data: rows } = await db
      .from("orders")
      .select("id")
      .eq("client_id", clientId)
      .is("deleted_at", null);
    expect(rows).toHaveLength(1);
  });

  test("the picker shows the occupied booking and excludes its 11:00 quick-slot", async ({ page }) => {
    const { clientId } = await seedClientWithCar();
    const date = nextWeekdayDate(1, 0); // a near, navigable weekday
    // Occupy Box 1 at 11:00 on that date.
    const occupied = await seedOrder({ box: 1, date, time: "11:00" });

    await page.goto(`/orders/new?clientId=${clientId}`);
    await wizardToTermin(page);
    await wizardGoToDate(page, date);

    // The occupied order renders as a block in the picker (occupancy-aware), and
    // Box 1's 11:00 is never offered as a free quick-slot (overlap math is
    // unit-tested in slot-grid.test.ts).
    await expect(page.locator(`[data-occupied-order="${occupied.orderId}"]`).first()).toBeVisible();
    await expect(page.locator(`[data-quick-slot="${date}-1-11:00"]`)).toHaveCount(0);
  });
});

test.describe("worker (prevadzka) — booking (wizard)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("can create an order (workers may book — PRD §3)", async ({ page }) => {
    const { clientId } = await seedClientWithCar();
    const db = serviceClient();

    await page.goto(`/orders/new?clientId=${clientId}`);
    await wizardToTermin(page);
    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Vytvoriť rezerváciu" }).click();

    await expect(page.getByText("Objednávka vytvorená.")).toBeVisible();
    const { data: rows } = await db
      .from("orders")
      .select("id")
      .eq("client_id", clientId)
      .is("deleted_at", null);
    expect(rows).toHaveLength(1);
  });
});
