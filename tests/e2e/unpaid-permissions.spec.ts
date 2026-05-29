import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, WORKER_EMAIL } from "./support";

test.describe("unpaid alerts — authorization (spec 10 §4.4)", () => {
  test("prevádzka gets 403 on /unpaid and sees no badge on home", async ({ browser }) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });
    const page = await ctx.newPage();

    await page.goto("/unpaid");
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
    await expect(page.locator('[data-section="unpaid"]')).toHaveCount(0);

    // No overdue badge in the worker's home header.
    await page.goto("/");
    await expect(page.locator("[data-unpaid-badge]")).toHaveCount(0);

    await ctx.close();
  });

  test("manažér sees the /unpaid list", async ({ browser }) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });
    const page = await ctx.newPage();

    await page.goto("/unpaid");
    await expect(page.getByRole("heading", { name: "Nezaplatené objednávky" })).toBeVisible();
    await expect(page.locator('[data-section="unpaid"]')).toBeVisible();

    await ctx.close();
  });
});
