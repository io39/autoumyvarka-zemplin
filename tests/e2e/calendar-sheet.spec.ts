import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, WORKER_EMAIL, seedOrder, serviceClient } from "./support";

const SECTIONS = ["client", "car", "services", "workers", "note", "sms", "status"];

test.describe("calendar order popup Sheet (manager)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("clicking a calendar block opens the Sheet with the §7 cards", async ({ page }) => {
    const o = await seedOrder();
    await page.goto(`/?date=${o.date}`);

    await page.locator(`[data-order-id="${o.orderId}"]`).first().click();
    const sheet = page.locator("[data-order-sheet]");
    await expect(sheet).toBeVisible();

    // All §7 section cards render inside the Sheet.
    for (const s of SECTIONS) {
      await expect(sheet.locator(`[data-section="${s}"]`)).toBeVisible();
    }
    // SMS empty state, and manager-only controls present.
    await expect(sheet.getByText("Žiadne SMS pre túto objednávku.")).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Zmeniť čas" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Zrušiť objednávku" })).toBeVisible();

    // Closing the Sheet returns to the calendar.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("day-view card shows the category label, price, and a wrapping note", async ({ page }) => {
    const note = "Klient si praje aj vyleštenie diskov a voňavku do interiéru, dôkladne prosím";
    const o = await seedOrder({ note });
    await page.goto(`/?date=${o.date}`);

    const card = page.locator(`[data-order-id="${o.orderId}"]`).first();
    await expect(card).toBeVisible();
    // Category label (seed cars are "os") + a formatted price + the full note.
    await expect(card).toContainText("OS");
    await expect(card).toContainText("€");
    const noteEl = card.getByText(note);
    await expect(noteEl).toBeVisible();
    // The note wraps (up to 3 lines), it is not the single-line truncate.
    await expect(noteEl).toHaveClass(/line-clamp-3/);
    await expect(noteEl).not.toHaveClass(/truncate/);
  });

  test("advancing status from the Sheet persists", async ({ page }) => {
    const o = await seedOrder();
    await page.goto(`/?date=${o.date}`);

    await page.locator(`[data-order-id="${o.orderId}"]`).first().click();
    const sheet = page.locator("[data-order-sheet]");
    await sheet.getByRole("button", { name: "Označiť ako hotovú" }).click();
    await expect(page.getByText("Stav: Hotová.")).toBeVisible();

    const db = serviceClient();
    const { data } = await db.from("orders").select("status").eq("id", o.orderId).single();
    expect(data!.status).toBe("hotova");
  });
});

test.describe("calendar Sheet role gating (prevádzka)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("worker opens the Sheet: no manager controls, can advance status + assign a worker", async ({
    page,
  }) => {
    const o = await seedOrder();
    await page.goto(`/?date=${o.date}`);

    await page.locator(`[data-order-id="${o.orderId}"]`).first().click();
    const sheet = page.locator("[data-order-sheet]");
    await expect(sheet).toBeVisible();

    // Manager-only controls absent for prevádzka.
    await expect(sheet.getByRole("button", { name: "Zmeniť čas" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Zrušiť objednávku" })).toHaveCount(0);
    await expect(sheet.locator('[data-section="note"]').getByRole("button")).toHaveCount(0);

    // Assign a worker (both roles may) from the Sheet.
    await sheet.locator("#worker-select").click();
    await page.getByRole("option").first().click();
    await sheet.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect(page.getByText("Zamestnanec pridaný.")).toBeVisible();

    const db = serviceClient();
    const { data: rows } = await db
      .from("order_staff")
      .select("worker_id")
      .eq("order_id", o.orderId);
    expect(rows).toHaveLength(1);

    // Advance status (both roles).
    await sheet.getByRole("button", { name: "Označiť ako hotovú" }).click();
    await expect(page.getByText("Stav: Hotová.")).toBeVisible();
  });
});
