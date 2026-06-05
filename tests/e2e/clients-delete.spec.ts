import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  uniquePhone,
  createClientViaUI,
} from "./support";

test.describe("delete client (soft-delete, manager only — spec 17)", () => {
  test("manager deletes a client → it disappears from search", async ({ page }) => {
    await page.context().setExtraHTTPHeaders(accessHeaders(MANAGER_EMAIL));
    const name = "Zmaz Test " + Date.now().toString(36);
    await createClientViaUI(page, { phone: uniquePhone(), name });

    // On the client detail; delete via the red button + confirm.
    await page.locator('[data-action="delete-client"]').click();
    await page.getByRole("button", { name: "Odstrániť", exact: true }).click();

    // Lands back on /clients with no selection.
    await page.waitForURL(/\/clients(\?.*)?$/);
    await expect(page).not.toHaveURL(/[?&]id=/);

    // The client no longer surfaces in the fuzzy search.
    await page.getByLabel("Hľadať klienta").fill(name);
    await expect(page.getByText("Žiadny výsledok")).toBeVisible();
  });

  test("worker (prevádzka) sees no delete button", async ({ page }) => {
    await page.context().setExtraHTTPHeaders(accessHeaders(MANAGER_EMAIL));
    const id = await createClientViaUI(page, { phone: uniquePhone(), name: "Worker NoDelete" });

    await page.context().setExtraHTTPHeaders(accessHeaders(WORKER_EMAIL));
    await page.goto(`/clients?id=${id}`);
    await expect(page.locator('[data-section="client"]')).toBeVisible();
    await expect(page.locator('[data-action="delete-client"]')).toHaveCount(0);
  });
});
