import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, WORKER_EMAIL, uniqueEmail } from "./support";

test.describe("manager", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("can open /staff and see the staff table", async ({ page }) => {
    await page.goto("/staff");
    const accounts = page.locator('[data-section="accounts-manager"]');
    await expect(page.getByRole("heading", { name: "Účty", exact: true })).toBeVisible();
    await expect(accounts.getByRole("button", { name: "Pridať" })).toBeVisible();
  });

  test("can create a worker, then deactivate them", async ({ page }) => {
    const email = uniqueEmail("worker");
    const name = `Pracovník ${Date.now()}`;

    await page.goto("/staff");
    const accounts = page.locator('[data-section="accounts-manager"]');
    await accounts.getByRole("button", { name: "Pridať" }).click();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Meno").fill(name);
    // Role select defaults to "prevadzka" — leave it.
    await page.getByRole("button", { name: "Uložiť" }).click();

    // New row appears (email shown in the manager table).
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();
    await expect(row.getByText("Aktívny")).toBeVisible();

    // Deactivate it — the accounts block hides inactive rows by default, so
    // the row drops out of the default view once the refresh lands.
    await row.getByRole("button", { name: "Deaktivovať" }).click();
    await expect(row).toHaveCount(0);

    // Toggling "Zobraziť neaktívne" reveals it again with the Neaktívny badge.
    await accounts.getByRole("button", { name: "Zobraziť neaktívne" }).click();
    await expect(row.getByText("Neaktívny")).toBeVisible();
  });

  test("cannot deactivate their own account (no lockout)", async ({ page }) => {
    await page.goto("/staff");
    const ownRow = page.getByRole("row").filter({ hasText: MANAGER_EMAIL });
    // The self-deactivate control is disabled in the UI.
    await expect(ownRow.getByRole("button", { name: "Deaktivovať" })).toBeDisabled();
  });
});

test.describe("worker (prevadzka)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("gets the 403 view on /staff", async ({ page }) => {
    await page.goto("/staff");
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Účty", exact: true })).toHaveCount(0);
  });
});
