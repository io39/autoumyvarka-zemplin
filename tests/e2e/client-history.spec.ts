import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  uniquePhone,
  uniqueSpz,
  createClientViaUI,
  addCarViaUI,
  seedOrderFor,
  serviceClient,
} from "./support";

test.describe("client service history (spec 08)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("search by phone → cars + full chronological history incl. no-show, links to order", async ({
    page,
  }) => {
    const db = serviceClient();
    const phone = uniquePhone();
    const spz = uniqueSpz();
    const expectedE164 = "+421" + phone.slice(1);

    const clientId = await createClientViaUI(page, { phone, name: "Histor Klient" });
    await addCarViaUI(page, spz);
    // ŠPZ now shows in both the "Autá" list and the history section header.
    await expect(page.getByText(spz, { exact: true }).first()).toBeVisible();

    const { data: car } = await db.from("cars").select("id").eq("spz", spz).single();

    // Two performed orders on this car: one paid (with an assigned worker), one no-show.
    await seedOrderFor({
      clientId,
      carId: car!.id,
      status: "zaplatena",
      workerName: "Peter",
    });
    await seedOrderFor({ clientId, carId: car!.id, status: "nedostavil_sa" });

    // Reach the client via the unified search.
    await page.goto("/clients");
    await page.getByLabel("Hľadať klienta").fill(phone.slice(2, 8));
    await page.getByText(expectedE164).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);

    const history = page.locator('[data-section="history"]');
    await expect(history).toBeVisible();
    await expect(history.getByText(spz, { exact: true })).toBeVisible();
    // Both statuses are visible, incl. the grey no-show badge.
    await expect(history.getByText("Zaplatená")).toBeVisible();
    await expect(history.getByText("Nedostavil sa")).toBeVisible();
    // The assigned worker shows on the paid order.
    await expect(history.getByText(/Peter/)).toBeVisible();

    // Clicking an entry navigates to the order detail.
    await history.locator("a").first().click();
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  });

  test("a shared ŠPZ shows orders booked by the other client too, with the hint", async ({
    page,
  }) => {
    const db = serviceClient();
    const spz = uniqueSpz();
    const phoneA = uniquePhone();
    const phoneB = uniquePhone();

    // Client A + new car.
    const clientA = await createClientViaUI(page, { phone: phoneA, name: "Owner A" });
    await addCarViaUI(page, spz);
    await expect(page.getByText(spz, { exact: true }).first()).toBeVisible();
    const { data: car } = await db.from("cars").select("id").eq("spz", spz).single();

    // Client B + the SAME plate → link-confirm.
    const clientB = await createClientViaUI(page, { phone: phoneB, name: "Owner B" });
    await addCarViaUI(page, spz);
    await expect(page.getByText("ŠPZ už existuje")).toBeVisible();
    await page.getByRole("button", { name: "Prepojiť" }).click();
    await expect(page.getByText(spz, { exact: true }).first()).toBeVisible();

    // One order booked under each client, both on the shared car.
    await seedOrderFor({ clientId: clientA, carId: car!.id, status: "zaplatena" });
    await seedOrderFor({ clientId: clientB, carId: car!.id, status: "hotova" });

    // Each client's page shows BOTH orders for the shared car + the hint.
    for (const id of [clientA, clientB]) {
      await page.goto(`/clients/${id}`);
      const carCard = page.locator(`[data-car-id="${car!.id}"]`);
      await expect(carCard.getByText("zdieľané auto")).toBeVisible();
      await expect(carCard.locator("ul > li")).toHaveCount(2);
    }
  });
});
