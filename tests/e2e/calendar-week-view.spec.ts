import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL } from "./support";

test.describe("calendar — week view", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("toggle shows 7 day cells and date links open each day", async ({ page }) => {
    await page.goto("/?view=week");
    await expect(page.getByRole("heading", { name: "Kalendár" })).toBeVisible();

    // Seven day cells should be present.
    const cells = page.locator("[data-day]");
    await expect(cells).toHaveCount(7);

    // Two box sub-columns per day.
    const boxes = page.locator("[data-day] [data-box]");
    await expect(boxes).toHaveCount(14);

    // Day header is a link back into the day view.
    const firstLink = page.locator("a[href*='/?view=day&date=']").first();
    await expect(firstLink).toBeVisible();
  });

  test("week navigation advances by 7 days", async ({ page }) => {
    await page.goto("/?view=week&date=2026-06-01");
    await page.getByRole("button", { name: /nasledujúci týždeň/i }).click();
    await page.waitForURL(/date=2026-06-08/);
  });
});
