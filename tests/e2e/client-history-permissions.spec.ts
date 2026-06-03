import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  seedOrder,
} from "./support";

/**
 * Both roles may view client history (PRD §3: "Zobrazenie histórie klienta —
 * Áno/Áno"). The per-car history entries are read-only — edits happen on the
 * order (spec 06) — so an expanded order shows a link to the full order, not
 * mutating controls. (The car-level "Upraviť auto" is manager-only and is
 * covered separately in clients-permissions.)
 */
test.describe("client history — authorization (spec 08 / 17)", () => {
  for (const [label, email] of [
    ["manažér", MANAGER_EMAIL],
    ["prevádzka", WORKER_EMAIL],
  ] as const) {
    test(`${label} can view the history; order entries are read-only`, async ({ browser }) => {
      const { clientId, carId, orderId } = await seedOrder({ status: "zaplatena" });

      const context = await browser.newContext({ extraHTTPHeaders: accessHeaders(email) });
      const page = await context.newPage();
      await page.goto(`/clients?id=${clientId}`);

      const history = page.locator('[data-section="history"]');
      await expect(history).toBeVisible();

      // Car blocks are expanded by default → its visit history shows immediately.
      const carCard = history.locator(`[data-car-id="${carId}"]`);
      await expect(carCard.getByText("Zaplatená")).toBeVisible();

      // Expand the order → read-only: a link to the full order, no edit controls.
      const orderRow = carCard.locator(`[data-order-id="${orderId}"]`);
      await orderRow.getByRole("button").first().click();
      await expect(orderRow.getByRole("link", { name: /Otvoriť objednávku/ })).toBeVisible();
      await expect(
        orderRow.getByRole("button", { name: /Upraviť|Odstrániť|Uložiť|Zmeniť|Pridať/ }),
      ).toHaveCount(0);

      await context.close();
    });
  }
});
