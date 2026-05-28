import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  seedOrder,
} from "./support";

/**
 * Both roles may view client history (PRD §3: "Zobrazenie histórie klienta —
 * Áno/Áno"). The history section itself is read-only — edits happen on the
 * order (spec 06) — so it contains links, not mutating controls.
 */
test.describe("client history — authorization (spec 08 §4.4)", () => {
  for (const [label, email] of [
    ["manažér", MANAGER_EMAIL],
    ["prevádzka", WORKER_EMAIL],
  ] as const) {
    test(`${label} can view the history and it has no mutating controls`, async ({ browser }) => {
      const { clientId } = await seedOrder({ status: "zaplatena" });

      const context = await browser.newContext({ extraHTTPHeaders: accessHeaders(email) });
      const page = await context.newPage();
      await page.goto(`/clients/${clientId}`);

      const history = page.locator('[data-section="history"]');
      await expect(history).toBeVisible();
      await expect(history.getByText("Zaplatená")).toBeVisible();
      // Read-only: the history section exposes links to orders, no buttons.
      await expect(history.locator("button")).toHaveCount(0);

      await context.close();
    });
  }
});
