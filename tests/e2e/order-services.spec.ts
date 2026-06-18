import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  pickAFreeSlot,
  seedOrder,
  serviceClient,
} from "./support";

test.describe("order services on existing order (manager)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("add a service via the wizard to a zaplatena order; pay it; original lines stay paid", async ({
    page,
  }) => {
    const db = serviceClient();
    // Pin into the safe 11:00–12:45 window so adding another service still fits
    // within the seeded 17:00 close and doesn't overlap fixtures from other suites.
    const o = await seedOrder({ status: "zaplatena", time: "11:00" });
    // Mark the original line paid (a paid order would normally have all lines
    // paid before transition).
    await db.from("order_services").update({ paid: true }).eq("id", o.serviceLineId);

    // Adding a service routes into the wizard's Služby step (no inline add form).
    await page.goto(`/orders/${o.orderId}`);
    await page.getByRole("link", { name: "Pridať služby" }).click();
    await expect(page.locator('[data-step="services"]')).toBeVisible();

    // Check the first unchecked, enabled service → a second line.
    const boxes = page.locator('[data-step="services"] label[data-service-id] [role="checkbox"]');
    const count = await boxes.count();
    for (let i = 0; i < count; i++) {
      const cb = boxes.nth(i);
      if (!(await cb.isChecked()) && (await cb.isEnabled())) {
        await cb.check();
        break;
      }
    }
    // Toggling a service clears the pre-picked slot (its length may now differ),
    // so re-confirm a free slot, then save.
    await page.getByRole("button", { name: "Ďalej" }).click(); // → Termín
    await pickAFreeSlot(page);
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByText("Zmeny uložené.")).toBeVisible();

    // Two active lines: the original (paid) + the new (unpaid).
    const { data: lines } = await db
      .from("order_services")
      .select("id, paid")
      .eq("order_id", o.orderId)
      .is("removed_at", null);
    expect(lines!.length).toBe(2);
    const original = lines!.find((l) => l.id === o.serviceLineId)!;
    const added = lines!.find((l) => l.id !== o.serviceLineId)!;
    expect(original.paid).toBe(true);
    expect(added.paid).toBe(false);

    // Pay the new line via the inline toggle on the order detail (kept).
    await page.goto(`/orders/${o.orderId}`);
    await page
      .locator(`[data-service-line-id="${added.id}"]`)
      .locator('[role="checkbox"]')
      .click();
    await expect(page.getByText("Platba zmenená.")).toBeVisible();
    const { data: after } = await db
      .from("order_services")
      .select("paid")
      .eq("id", added.id)
      .single();
    expect(after!.paid).toBe(true);
  });

  test("remove service line allowed only while vytvorena", async ({ page }) => {
    const db = serviceClient();

    // Vytvorena: removal allowed.
    const fresh = await seedOrder();
    await page.goto(`/orders/${fresh.orderId}`);
    await page
      .locator(`[data-service-line-id="${fresh.serviceLineId}"]`)
      .getByRole("button", { name: "Odstrániť" })
      .click();
    await expect(page.getByText("Služba odstránená.")).toBeVisible();
    const { data: removed } = await db
      .from("order_services")
      .select("removed_at")
      .eq("id", fresh.serviceLineId)
      .single();
    expect(removed!.removed_at).not.toBeNull();

    // Hotova: the "Odstrániť" button must be disabled (server also rejects).
    const performed = await seedOrder({ status: "hotova" });
    await page.goto(`/orders/${performed.orderId}`);
    await expect(
      page
        .locator(`[data-service-line-id="${performed.serviceLineId}"]`)
        .getByRole("button", { name: "Odstrániť" }),
    ).toBeDisabled();
    const { data: still } = await db
      .from("order_services")
      .select("removed_at")
      .eq("id", performed.serviceLineId)
      .single();
    expect(still!.removed_at).toBeNull();
  });

  test("marking an order Zaplatená ticks all its service lines paid", async ({ page }) => {
    const db = serviceClient();
    const o = await seedOrder({ status: "hotova", time: "11:00" });

    // The seeded line starts unpaid.
    const { data: before } = await db
      .from("order_services")
      .select("paid")
      .eq("id", o.serviceLineId)
      .single();
    expect(before!.paid).toBe(false);

    await page.goto(`/orders/${o.orderId}`);
    await page.getByRole("button", { name: "Označiť ako zaplatenú" }).click();
    await expect(page.getByText("Stav: Zaplatená.")).toBeVisible();

    // The cascade settled the line.
    const { data: after } = await db
      .from("order_services")
      .select("paid")
      .eq("id", o.serviceLineId)
      .single();
    expect(after!.paid).toBe(true);
  });

});
