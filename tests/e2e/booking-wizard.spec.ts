import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  pickAFreeSlot,
  seedClientWithCar,
  seedOrder,
  serviceClient,
  uniquePhone,
} from "./support";

test.describe("booking wizard — create (manager)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("blank flow: search client → car → services → slot → create", async ({ page }) => {
    const { clientId, phone } = await seedClientWithCar();

    await page.goto("/orders/new");

    // Step 1 — search + select the client (auto-advances to step 2).
    await page.getByLabel(/Hľadať klienta/).fill(phone);
    await page.locator(`[data-client-id="${clientId}"]`).click();

    // Step 2 — pick the car, then Ďalej.
    await page.locator('[data-step="car"] [data-car-id]').first().click();
    await page.getByRole("button", { name: "Ďalej" }).click();

    // Step 3 — select a main service; Σ updates; Ďalej.
    await page.locator('[data-step="services"] label[data-service-id]').first().click();
    await expect(page.locator("[data-summary-duration]")).toContainText("min");
    await page.getByRole("button", { name: "Ďalej" }).click();

    // Step 4 — pick a free slot and create.
    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Vytvoriť rezerváciu" }).click();

    await expect(page.getByText("Objednávka vytvorená.")).toBeVisible();
    await expect(page).toHaveURL(/\/\?date=\d{4}-\d{2}-\d{2}/);
  });

  test("an unregistered number shows a Nový zákazník row → dialog (phone pre-filled) creates + selects, landing on step 2", async ({ page }) => {
    await page.goto("/orders/new");
    // Typing a full, unregistered number appends a "Nový zákazník" row (styled
    // like a result, showing the number) — no standalone add-customer button.
    await page.getByLabel(/Hľadať klienta/).fill(uniquePhone());
    await page.locator("[data-new-client]").click();
    // The previous popup opens with the phone already filled in.
    await expect(page.getByLabel("Telefón", { exact: true })).not.toHaveValue("");
    await page.getByLabel(/Meno/).fill("Nový Wizard");
    await page.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect(page.getByText("Klient pridaný.")).toBeVisible();
    // Now on step 2 (Auto).
    await expect(page.locator('[data-step="car"]')).toBeVisible();
  });

  test("client prefill (?clientId=) starts at step 2", async ({ page }) => {
    const { clientId } = await seedClientWithCar();
    await page.goto(`/orders/new?clientId=${clientId}`);
    await expect(page.locator('[data-step="car"]')).toBeVisible();
    await expect(page.locator('[data-stepper] [data-step="1"][data-active]')).toBeVisible();
  });
});

test.describe("booking wizard — edit mode / Zmeniť čas", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("Zmeniť čas opens on the Termín step; change a service + move slot saves", async ({
    page,
  }) => {
    const o = await seedOrder();
    const db = serviceClient();
    const { data: before } = await db
      .from("orders")
      .select("starts_at")
      .eq("id", o.orderId)
      .single();

    // From the order detail, Zmeniť čas → edit wizard.
    await page.goto(`/orders/${o.orderId}`);
    await page.getByRole("link", { name: "Zmeniť čas" }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${o.orderId}/edit`));

    // Opens directly on the Termín (time) step.
    await expect(page.locator('[data-step="termin"]')).toBeVisible();

    // Step back to Služby via the stepper and add another service.
    await page.locator('[data-stepper] [data-step="2"]').click();
    const services = page.locator('[data-step="services"] label[data-service-id] input');
    const count = await services.count();
    for (let i = 0; i < count; i++) {
      const cb = services.nth(i);
      if (!(await cb.isChecked()) && (await cb.isEnabled())) {
        await cb.check();
        break;
      }
    }
    await page.getByRole("button", { name: "Ďalej" }).click();

    // Move to a different free slot, then save.
    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByText("Zmeny uložené.")).toBeVisible();
    // After confirming a time edit, the user lands on the calendar (not back on
    // the order detail) so the updated slot is visible in context.
    await expect(page).toHaveURL(/\/\?date=\d{4}-\d{2}-\d{2}/);

    const { data: after } = await db
      .from("orders")
      .select("starts_at")
      .eq("id", o.orderId)
      .single();
    expect(after!.starts_at).not.toBe(before!.starts_at);
  });
});

test.describe("booking wizard — edit route gating (prevádzka)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("prevádzka gets 403 on the edit route (manager-only)", async ({ page }) => {
    const o = await seedOrder();
    await page.goto(`/orders/${o.orderId}/edit`);
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
  });
});
