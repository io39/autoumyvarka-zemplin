import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  bratislavaDateOffset,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  pickAFreeSlot,
  seedClientWithCar,
  seedOrder,
  serviceClient,
  uniquePhone,
  uniqueSpz,
  wizardGoToDate,
} from "./support";

/** A near-future Mon–Fri date (seed hours: Sun closed, Sat half-day). */
function nextOpenWeekday(): string {
  for (let d = 1; d <= 8; d++) {
    const key = bratislavaDateOffset(d);
    const [y, m, dd] = key.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); // 0=Sun … 6=Sat
    if (dow >= 1 && dow <= 5) return key;
  }
  return bratislavaDateOffset(1);
}

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

  test("manager can set a manual order price (override) on create", async ({ page }) => {
    const { clientId, phone } = await seedClientWithCar();

    await page.goto("/orders/new");
    await page.getByLabel(/Hľadať klienta/).fill(phone);
    await page.locator(`[data-client-id="${clientId}"]`).click();
    await page.locator('[data-step="car"] [data-car-id]').first().click();
    await page.getByRole("button", { name: "Ďalej" }).click();
    await page.locator('[data-step="services"] label[data-service-id]').first().click();

    // Manager-only price field: typing replaces the running total and flags it.
    await page.locator("[data-price-override]").fill("99,90");
    await expect(page.locator("[data-summary-price]")).toContainText("99,90");
    await expect(page.locator("[data-summary-price]")).toContainText("upravená");

    await page.getByRole("button", { name: "Ďalej" }).click();
    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Vytvoriť rezerváciu" }).click();
    await expect(page.getByText("Objednávka vytvorená.")).toBeVisible();

    // Persisted as cents; the order detail shows the override as the total.
    const db = serviceClient();
    const { data: order } = await db
      .from("orders")
      .select("id, price_override_cents")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(order!.price_override_cents).toBe(9990);

    await page.goto(`/orders/${order!.id}`);
    const services = page.locator('[data-section="services"]');
    await expect(services).toContainText("99,90");
    await expect(services).toContainText("upravená cena");
  });

  test("picking an occupied time warns, then creates the overlapping booking on confirm", async ({
    page,
  }) => {
    const { clientId, phone } = await seedClientWithCar();
    // Occupy Box 1 on a near open weekday so the picker shows it in a lane with
    // a reserved free lane beside it.
    const date = nextOpenWeekday();
    await seedOrder({ box: 1, date, time: "11:00" });

    await page.goto(`/orders/new?clientId=${clientId}`);
    expect(phone).toBeTruthy();
    await page.locator('[data-step="car"] [data-car-id]').first().click();
    await page.getByRole("button", { name: "Ďalej" }).click();
    await page.locator('[data-step="services"] label[data-service-id]').first().click();
    await page.getByRole("button", { name: "Ďalej" }).click();

    // Step 4: navigate to the date; the occupied booking renders as a lane block.
    await wizardGoToDate(page, date);
    const occupied = page
      .locator(`[data-step="termin"] [data-day="${date}"] [data-occupied-order]`)
      .first();
    await expect(occupied).toBeVisible();

    // Click the occupied block's area → picks an overlapping time (the block is
    // click-through). A slot is then selected.
    await occupied.click();
    await expect(page.locator("[data-selection-bar]")).not.toContainText("Žiadny termín");

    // Finish → overlap confirm dialog → confirm → the order is created.
    await page.getByRole("button", { name: "Vytvoriť rezerváciu" }).click();
    await expect(page.getByRole("heading", { name: "Termín sa prekrýva" })).toBeVisible();
    await page.locator("[data-overlap-confirm]").click();
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

  test("Auto step: manager can edit one of the client's cars via Upraviť", async ({ page }) => {
    const { clientId, carId } = await seedClientWithCar();
    const db = serviceClient();

    await page.goto(`/orders/new?clientId=${clientId}`);
    await expect(page.locator('[data-step="car"]')).toBeVisible();

    // The per-row "Upraviť" opens the shared edit-car dialog.
    await page.locator(`[data-edit-car-id="${carId}"]`).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /Upraviť auto/ })).toBeVisible();
    const newSpz = uniqueSpz("ED");
    await dialog.locator("#edit-car-spz").fill(newSpz);
    await dialog.getByRole("button", { name: "Uložiť", exact: true }).click();
    await expect(page.getByText("Zmeny uložené.")).toBeVisible();

    // Persisted, and the refreshed row shows the new plate.
    const { data: car } = await db.from("cars").select("spz").eq("id", carId).single();
    expect(car!.spz).toBe(newSpz);
    await expect(page.locator(`[data-car-id="${carId}"]`)).toContainText(newSpz);
  });
});

test.describe("booking wizard — edit mode", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("Zmeniť čas opens on the Termín step; picking a new slot saves", async ({ page }) => {
    const o = await seedOrder();
    const db = serviceClient();
    const { data: before } = await db
      .from("orders")
      .select("starts_at")
      .eq("id", o.orderId)
      .single();

    // From the order detail, Zmeniť čas → edit wizard, landing on Termín.
    await page.goto(`/orders/${o.orderId}`);
    await page.getByRole("link", { name: "Zmeniť čas" }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${o.orderId}/edit\\?step=time`));
    await expect(page.locator('[data-step="termin"]')).toBeVisible();

    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByText("Zmeny uložené.")).toBeVisible();
    // After a time edit the user lands on the calendar at the new date.
    await expect(page).toHaveURL(/\/\?date=\d{4}-\d{2}-\d{2}/);

    const { data: after } = await db
      .from("orders")
      .select("starts_at")
      .eq("id", o.orderId)
      .single();
    expect(after!.starts_at).not.toBe(before!.starts_at);
  });

  test("edit (Služby step) exposes the manual Trvanie override; saves new duration", async ({
    page,
  }) => {
    const o = await seedOrder();
    const db = serviceClient();
    const { data: before } = await db
      .from("orders")
      .select("duration_min")
      .eq("id", o.orderId)
      .single();

    // The Služby entry point (?step=services) shows the manual "Trvanie"
    // override (it used to be create-only — the bug).
    await page.goto(`/orders/${o.orderId}/edit?step=services`);
    await expect(page.locator('[data-step="services"]')).toBeVisible();
    const override = page.locator("#override");
    await expect(override).toBeVisible();

    const newDuration = (before!.duration_min ?? 30) + 15;
    await override.fill(String(newDuration));
    await page.getByRole("button", { name: "Ďalej" }).click();
    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByText("Zmeny uložené.")).toBeVisible();

    const { data: after } = await db
      .from("orders")
      .select("duration_min")
      .eq("id", o.orderId)
      .single();
    expect(after!.duration_min).toBe(newDuration);
  });

  test("Pridať služby button opens the Služby step; adding a service + move slot saves", async ({
    page,
  }) => {
    const o = await seedOrder();
    const db = serviceClient();
    const linesBefore = await db
      .from("order_services")
      .select("id")
      .eq("order_id", o.orderId)
      .is("removed_at", null);

    // The order-detail "Pridať služby" button routes into the wizard's Služby step.
    await page.goto(`/orders/${o.orderId}`);
    await page.getByRole("link", { name: "Pridať služby" }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${o.orderId}/edit\\?step=services`));
    await expect(page.locator('[data-step="services"]')).toBeVisible();

    // Add another (enabled, unchecked) service — this widens the duration.
    const services = page.locator('[data-step="services"] label[data-service-id] [role="checkbox"]');
    const count = await services.count();
    for (let i = 0; i < count; i++) {
      const cb = services.nth(i);
      if (!(await cb.isChecked()) && (await cb.isEnabled())) {
        await cb.check();
        break;
      }
    }

    // Pick a free slot for the new (longer) duration and save — must not falsely
    // report the box as occupied (the move precedes the service widening).
    await page.getByRole("button", { name: "Ďalej" }).click();
    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByText("Zmeny uložené.")).toBeVisible();
    await expect(page).toHaveURL(/\/\?date=\d{4}-\d{2}-\d{2}/);

    const linesAfter = await db
      .from("order_services")
      .select("id")
      .eq("order_id", o.orderId)
      .is("removed_at", null);
    expect((linesAfter.data ?? []).length).toBe((linesBefore.data ?? []).length + 1);
  });

  test("edit: add a service but a shorter manual duration wins (no false hours error)", async ({
    page,
  }) => {
    const o = await seedOrder({ time: "11:00" });
    const db = serviceClient();

    await page.goto(`/orders/${o.orderId}/edit?step=services`);
    await expect(page.locator('[data-step="services"]')).toBeVisible();

    // Add another (longer) service…
    const services = page.locator('[data-step="services"] label[data-service-id] [role="checkbox"]');
    const count = await services.count();
    for (let i = 0; i < count; i++) {
      const cb = services.nth(i);
      if (!(await cb.isChecked()) && (await cb.isEnabled())) {
        await cb.check();
        break;
      }
    }
    // …but set a SHORT manual duration (must win; the service-sum must not be
    // re-derived and falsely rejected on opening hours).
    await page.locator("#override").fill("15");

    await page.getByRole("button", { name: "Ďalej" }).click();
    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByText("Zmeny uložené.")).toBeVisible();
    await expect(page).toHaveURL(/\/\?date=\d{4}-\d{2}-\d{2}/);

    const { data: after } = await db
      .from("orders")
      .select("duration_min")
      .eq("id", o.orderId)
      .single();
    expect(after!.duration_min).toBe(15);
  });

  test("edit: manager can set a manual price; it persists", async ({ page }) => {
    const o = await seedOrder();
    const db = serviceClient();

    // No ?step= → defaults to the Služby step.
    await page.goto(`/orders/${o.orderId}/edit`);
    await expect(page.locator('[data-step="services"]')).toBeVisible();
    await page.locator("[data-price-override]").fill("123,45");

    await page.getByRole("button", { name: "Ďalej" }).click();
    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByText("Zmeny uložené.")).toBeVisible();

    const { data: after } = await db
      .from("orders")
      .select("price_override_cents")
      .eq("id", o.orderId)
      .single();
    expect(after!.price_override_cents).toBe(12345);
  });

  test("Zmeniť (Auto): switching the order's car re-prices the lines at the new category", async ({
    page,
  }) => {
    const o = await seedOrder({ time: "11:00" });
    const db = serviceClient();
    // Give the same client a second car in a DIFFERENT pricing category, so the
    // switch re-prices the seeded line.
    const { data: suvCar } = await db
      .from("cars")
      .insert({ spz: uniqueSpz("SV"), pricing_category: "suv" })
      .select("id")
      .single();
    await db.from("client_cars").insert({ client_id: o.clientId, car_id: suvCar!.id });
    const { data: suvPrice } = await db
      .from("service_prices")
      .select("price_cents")
      .eq("service_id", o.serviceId)
      .eq("pricing_category", "suv")
      .single();
    expect(suvPrice).not.toBeNull();

    // From the order detail, the Auto card's "Zmeniť" → wizard Auto step.
    await page.goto(`/orders/${o.orderId}`);
    await page.getByRole("link", { name: "Zmeniť", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${o.orderId}/edit\\?step=car`));
    await expect(page.locator('[data-step="car"]')).toBeVisible();

    // Pick the SUV car, advance through Služby → Termín, re-confirm a slot, save.
    await page.locator(`[data-step="car"] [data-car-id="${suvCar!.id}"]`).click();
    await page.getByRole("button", { name: "Ďalej" }).click(); // → Služby
    await page.getByRole("button", { name: "Ďalej" }).click(); // → Termín
    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByText("Zmeny uložené.")).toBeVisible();

    // The order now points at the SUV car and the line carries the SUV price.
    const { data: order } = await db
      .from("orders")
      .select("car_id")
      .eq("id", o.orderId)
      .single();
    expect(order!.car_id).toBe(suvCar!.id);
    const { data: line } = await db
      .from("order_services")
      .select("price_cents_snapshot, category_snapshot")
      .eq("id", o.serviceLineId)
      .single();
    expect(line!.category_snapshot).toBe("suv");
    expect(line!.price_cents_snapshot).toBe(suvPrice!.price_cents);
  });
});

test.describe("booking wizard — edit route gating (prevádzka)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("prevádzka gets 403 on the edit route (manager-only)", async ({ page }) => {
    const o = await seedOrder();
    await page.goto(`/orders/${o.orderId}/edit`);
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
  });

  test("prevádzka does not see the price override input in the wizard", async ({ page }) => {
    const { clientId, phone } = await seedClientWithCar();

    await page.goto("/orders/new");
    await page.getByLabel(/Hľadať klienta/).fill(phone);
    await page.locator(`[data-client-id="${clientId}"]`).click();
    await page.locator('[data-step="car"] [data-car-id]').first().click();
    await page.getByRole("button", { name: "Ďalej" }).click();

    await expect(page.locator('[data-step="services"]')).toBeVisible();
    await expect(page.locator("[data-price-override]")).toHaveCount(0);
  });

  test("prevádzka does not see the per-car Upraviť button on the Auto step", async ({ page }) => {
    const { clientId } = await seedClientWithCar();
    await page.goto(`/orders/new?clientId=${clientId}`);
    await expect(page.locator('[data-step="car"]')).toBeVisible();
    await expect(page.locator('[data-step="car"] [data-edit-car-id]')).toHaveCount(0);
  });
});
