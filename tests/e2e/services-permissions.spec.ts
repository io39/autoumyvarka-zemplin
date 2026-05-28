import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, WORKER_EMAIL } from "./support";

test.describe("manager — /services catalog", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("can open /services and see the seeded catalog", async ({ page }) => {
    await page.goto("/services");
    await expect(page.getByRole("heading", { name: "Katalóg služieb" })).toBeVisible();
    // The seed includes both kinds.
    await expect(page.getByRole("heading", { name: "Hlavné služby" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Doplnkové služby" })).toBeVisible();
    // A representative seeded entry from docs/services.md.
    await expect(page.getByRole("heading", { name: "Interiér Classic" })).toBeVisible();
  });

  test("can create a service, deactivate it, then it shows Neaktívna", async ({ page }) => {
    const name = `E2E služba ${Date.now()}`;
    await page.goto("/services");
    await page.getByRole("button", { name: "Pridať službu" }).click();
    await page.getByLabel("Názov").fill(name);
    // kind defaults to "Hlavná"; category defaults to "Os."; price required.
    await page.getByLabel("Cena (€)").fill("25,50");
    await page.getByLabel("Trvanie (min)").fill("60");
    await page.getByRole("button", { name: "Pridať" }).click();

    const card = page.locator("article").filter({ hasText: name });
    await expect(card).toBeVisible();
    await expect(card.getByText("Aktívna")).toBeVisible();

    await card.getByRole("button", { name: "Deaktivovať" }).click();
    await expect(card.getByText("Neaktívna")).toBeVisible();
  });
});

test.describe("worker (prevadzka)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("gets the 403 view on /services", async ({ page }) => {
    await page.goto("/services");
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Katalóg služieb" })).toHaveCount(0);
  });
});
