import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL } from "./support";

test.describe("SPRÁVA sections — restyle + structural tweaks (spec 18)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("/services: Hlavné/Doplnkové are collapsible accordions", async ({ page }) => {
    await page.goto("/services");

    const mainSection = page.locator('[data-section="main"]');
    const addonSection = page.locator('[data-section="addon"]');
    await expect(mainSection).toBeVisible();
    await expect(addonSection).toBeVisible();

    // Default-expanded → a seeded main service is visible.
    await expect(page.getByRole("heading", { name: "Interiér Classic" })).toBeVisible();

    // Collapse Hlavné → its content (cards) unmounts.
    const mainTrigger = mainSection.getByRole("button", { name: "Hlavné služby" });
    await mainTrigger.click();
    await expect(page.getByRole("heading", { name: "Interiér Classic" })).toHaveCount(0);

    // Expand again → visible.
    await mainTrigger.click();
    await expect(page.getByRole("heading", { name: "Interiér Classic" })).toBeVisible();
  });

  test("/settings/hours shows BOTH the hours and výnimky editors", async ({ page }) => {
    await page.goto("/settings/hours");
    await expect(page.getByRole("heading", { name: "Otváracie hodiny" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Výnimky pre konkrétne dni" })).toBeVisible();
    // Both editors' controls are present on the one page.
    await expect(page.locator('[data-day="0"]')).toBeVisible(); // weekly hours
    await expect(page.locator('[data-form="override"]')).toBeVisible(); // overrides
  });

  test("/settings/exceptions redirects to the merged /settings/hours", async ({ page }) => {
    await page.goto("/settings/exceptions");
    await expect(page).toHaveURL(/\/settings\/hours$/);
    await expect(page.getByRole("heading", { name: "Výnimky pre konkrétne dni" })).toBeVisible();
  });
});
