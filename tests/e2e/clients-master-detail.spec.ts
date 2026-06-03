import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  uniquePhone,
  uniqueSpz,
  createClientViaUI,
  addCarViaUI,
  seedOrderFor,
  serviceClient,
} from "./support";

test.describe("clients master-detail (spec 17)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("search → inline detail; ?id= survives refresh and back", async ({ page }) => {
    const phone = uniquePhone();
    const expectedE164 = "+421" + phone.slice(1);
    const clientId = await createClientViaUI(page, { phone, name: "Master Detail" });

    // Start clean on the list (no selection → blank prompt).
    await page.goto("/clients");
    await expect(page.getByText("Vyhľadajte zákazníka a vyberte ho zo zoznamu.")).toBeVisible();

    // Search and click → detail appears inline, URL gets ?id= (no /clients/<uuid> nav).
    await page.getByLabel("Hľadať klienta").fill(phone.slice(2, 8));
    await page.getByText(expectedE164).click();
    await expect(page).toHaveURL(new RegExp(`\\?id=${clientId}`));
    await expect(page.getByRole("heading", { name: "Master Detail" })).toBeVisible();

    // Refresh the ?id= URL → the same client re-opens.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Master Detail" })).toBeVisible();

    // Browser-back returns to the unselected list state.
    await page.goBack();
    await expect(page.getByText("Vyhľadajte zákazníka a vyberte ho zo zoznamu.")).toBeVisible();
  });

  test("/clients/<id> deep-link redirects to /clients?id=<id>", async ({ page }) => {
    const clientId = await createClientViaUI(page, { phone: uniquePhone(), name: "Deep Link" });
    await page.goto(`/clients/${clientId}`);
    await expect(page).toHaveURL(new RegExp(`/clients\\?id=${clientId}`));
    await expect(page.getByRole("heading", { name: "Deep Link" })).toBeVisible();
  });

  test("Nová rezervácia works with no cars and lands on wizard step 2", async ({ page }) => {
    const clientId = await createClientViaUI(page, { phone: uniquePhone(), name: "No Cars" });
    await page.goto(`/clients?id=${clientId}`);
    // Scope to the client header card — the sidebar nav also has a "Nová rezervácia" link.
    await page
      .locator('[data-section="client"]')
      .getByRole("link", { name: "Nová rezervácia" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/orders/new\\?clientId=${clientId}`));
    // Client is prefilled → wizard opens on the Auto step.
    await expect(page.locator('[data-step="car"]')).toBeVisible();
  });

  test("per-car accordion numbers visits with Poradie", async ({ page }) => {
    const db = serviceClient();
    const phone = uniquePhone();
    const spz = uniqueSpz();
    const clientId = await createClientViaUI(page, { phone, name: "Poradie Klient" });
    await addCarViaUI(page, spz);
    // Wait for the car to render before reading it back (insert completed).
    await expect(page.getByText(spz, { exact: true }).first()).toBeVisible();
    const { data: car } = await db.from("cars").select("id").eq("spz", spz).single();

    // Two visits on the car → Poradie 1 (oldest) and 2 (newest).
    await seedOrderFor({ clientId, carId: car!.id, status: "zaplatena" });
    await seedOrderFor({ clientId, carId: car!.id, status: "hotova" });

    await page.goto(`/clients?id=${clientId}`);
    const carCard = page.locator(`[data-section="history"] [data-car-id="${car!.id}"]`);
    // Car blocks are expanded by default — visits are visible without a click.
    await expect(carCard.locator("[data-order-id]")).toHaveCount(2);
    // Both per-car visit numbers are shown.
    await expect(carCard.getByText(/1\. ·/)).toBeVisible();
    await expect(carCard.getByText(/2\. ·/)).toBeVisible();
  });

  test("add a car with a brand (fuzzy-type + pick, and free-text) shows 'Značka Model'", async ({
    page,
  }) => {
    const clientId = await createClientViaUI(page, { phone: uniquePhone(), name: "Brand Klient" });
    await page.goto(`/clients?id=${clientId}`);

    // Fuzzy type without diacritics → pick the suggested brand.
    await page.getByRole("button", { name: "Pridať auto" }).click();
    const add = page.getByRole("dialog");
    await add.getByLabel("ŠPZ").fill(uniqueSpz());
    await add.getByLabel("Značka").fill("skod");
    await page.getByRole("option", { name: "Škoda" }).click();
    await add.getByLabel("Model").fill("Octavia");
    await add.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect(page.getByText("Škoda Octavia").first()).toBeVisible();

    // A brand not in the list → just typed as free text.
    await page.getByRole("button", { name: "Pridať auto" }).click();
    const other = page.getByRole("dialog");
    await other.getByLabel("ŠPZ").fill(uniqueSpz());
    await other.getByLabel("Značka").fill("Cupra");
    await other.getByLabel("Model").fill("Born");
    await other.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect(page.getByText("Cupra Born").first()).toBeVisible();
  });
});

test.describe("clients master-detail — worker (spec 17)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("worker can create + add a car (all roles)", async ({ page }) => {
    const spz = uniqueSpz();
    await createClientViaUI(page, { phone: uniquePhone(), name: "Worker MD" });
    await addCarViaUI(page, spz);
    await expect(page.getByText(spz, { exact: true }).first()).toBeVisible();
    // No manager-only edit affordances.
    await expect(page.getByRole("button", { name: /Upraviť/ })).toHaveCount(0);
  });
});
