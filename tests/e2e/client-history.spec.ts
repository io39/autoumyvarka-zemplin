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

test.describe("client service history (spec 08 / 17)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("search by phone → inline detail; expand car → history incl. no-show; open order", async ({
    page,
  }) => {
    const db = serviceClient();
    const phone = uniquePhone();
    const spz = uniqueSpz();
    const expectedE164 = "+421" + phone.slice(1);

    const clientId = await createClientViaUI(page, { phone, name: "Histor Klient" });
    await addCarViaUI(page, spz);
    // ŠPZ now shows in the per-car accordion header.
    await expect(page.getByText(spz, { exact: true }).first()).toBeVisible();

    const { data: car } = await db.from("cars").select("id").eq("spz", spz).single();

    // Two performed orders on this car: one paid (with an assigned worker), one no-show.
    const paid = await seedOrderFor({
      clientId,
      carId: car!.id,
      status: "zaplatena",
      workerName: "Peter",
    });
    await seedOrderFor({ clientId, carId: car!.id, status: "nedostavil_sa" });

    // Reach the client via the unified search → inline detail (no page nav), ?id= set.
    await page.goto("/clients");
    await page.getByLabel("Hľadať klienta").fill(phone.slice(2, 8));
    await page.getByText(expectedE164).click();
    await page.waitForURL(/\/clients\?id=[0-9a-f-]{36}/);

    const history = page.locator('[data-section="history"]');
    await expect(history).toBeVisible();

    const carCard = history.locator(`[data-car-id="${car!.id}"]`);
    await expect(carCard.getByText(spz, { exact: true })).toBeVisible();

    // Car blocks are expanded by default — its visits are visible immediately.
    await expect(carCard.getByText("Zaplatená")).toBeVisible();
    await expect(carCard.getByText("Nedostavil sa")).toBeVisible();

    // Expand the paid order → the assigned worker (Pracovníci) shows.
    const paidRow = carCard.locator(`[data-order-id="${paid.orderId}"]`);
    await paidRow.getByRole("button").first().click();
    await expect(paidRow.getByText(/Peter/)).toBeVisible();

    // Opening the full order navigates to the order detail page.
    await paidRow.getByRole("link", { name: /Otvoriť objednávku/ }).click();
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

    // Each client's page (via the kept /clients/[id] deep-link → ?id= redirect)
    // shows BOTH orders for the shared car + the hint.
    for (const id of [clientA, clientB]) {
      await page.goto(`/clients/${id}`);
      await page.waitForURL(/\/clients\?id=[0-9a-f-]{36}/);
      const carCard = page.locator(`[data-car-id="${car!.id}"]`);
      // The "zdieľané auto" hint shows in the accordion header.
      await expect(carCard.getByText("zdieľané auto")).toBeVisible();
      // Car blocks are expanded by default → both visits listed without a click.
      await expect(carCard.locator("[data-order-id]")).toHaveCount(2);
    }
  });
});
