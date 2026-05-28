import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, WORKER_EMAIL } from "./support";

test.describe("audit log — authorization (spec 09 §4.2, PRD §11.2)", () => {
  test("prevádzka gets the 403 view on /audit", async ({ browser }) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });
    const page = await ctx.newPage();
    await page.goto("/audit");

    // The Slovak 403 view; the audit table is NOT rendered.
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
    await expect(page.locator('[data-section="audit"]')).toHaveCount(0);
    await ctx.close();
  });

  test("manažér sees the audit table", async ({ browser }) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });
    const page = await ctx.newPage();
    await page.goto("/audit");

    await expect(page.getByRole("heading", { name: "Záznam zmien" })).toBeVisible();
    await expect(page.locator('[data-section="audit"]')).toBeVisible();
    await ctx.close();
  });
});
