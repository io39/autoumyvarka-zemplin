import { test, expect } from "@playwright/test";
import {
  MANAGER_EMAIL,
  WORKER_EMAIL,
  accessHeaders,
  serviceClient,
  seedOrder,
} from "./support";

test.describe("staff page — Účty + Zamestnanci (manager)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("shows both blocks and supports worker CRUD + hide-inactive", async ({ page }) => {
    await page.goto("/staff");

    // Both block headings present.
    await expect(page.getByRole("heading", { name: "Účty", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Zamestnanci", exact: true })).toBeVisible();

    const block = page.locator('[data-section="workers-manager"]');

    // Add a worker.
    const name = `QA Worker ${Date.now()}`;
    await block.getByRole("button", { name: "Pridať", exact: true }).click();
    await page.getByLabel("Meno").fill(name);
    await page.getByRole("button", { name: "Uložiť" }).click();
    await expect(page.getByText("Zamestnanec pridaný.")).toBeVisible();
    await expect(block.getByText(name)).toBeVisible();

    // Deactivate it.
    const db = serviceClient();
    const { data: created } = await db
      .from("workers")
      .select("id")
      .eq("display_name", name)
      .single();
    await block
      .locator(`[data-worker-id="${created!.id}"]`)
      .getByRole("button", { name: "Deaktivovať" })
      .click();
    await expect(page.getByText("Zamestnanec deaktivovaný.")).toBeVisible();

    // Default view hides it.
    await expect(block.locator(`[data-worker-id="${created!.id}"]`)).toHaveCount(0);

    // Toggle reveals it (dimmed, "Neaktívny").
    await block.getByRole("button", { name: "Zobraziť neaktívnych" }).click();
    await expect(block.locator(`[data-worker-id="${created!.id}"]`)).toBeVisible();
    await expect(
      block.locator(`[data-worker-id="${created!.id}"]`).getByText("Neaktívny"),
    ).toBeVisible();
  });

  test("deactivated worker drops out of the order assignment dropdown", async ({ page }) => {
    const db = serviceClient();
    const name = `Drop ${Date.now()}`;
    const { data: w } = await db
      .from("workers")
      .insert({ display_name: name })
      .select("id")
      .single();

    const { orderId } = await seedOrder();

    await page.goto(`/orders/${orderId}`);
    await page.locator("#worker-select").click();
    await expect(page.getByRole("option", { name })).toBeVisible();
    await page.keyboard.press("Escape");

    // Deactivate and reload — option gone.
    await db.from("workers").update({ active: false }).eq("id", w!.id);
    await page.reload();
    await page.locator("#worker-select").click();
    await expect(page.getByRole("option", { name })).toHaveCount(0);
  });
});

test.describe("staff page — worker (prevadzka) is blocked", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("prevadzka gets 403 on /staff", async ({ page }) => {
    await page.goto("/staff");
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Zamestnanci", exact: true })).toHaveCount(0);
  });
});
