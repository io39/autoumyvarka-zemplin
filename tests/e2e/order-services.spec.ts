import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  seedOrder,
  serviceClient,
} from "./support";

test.describe("order services on existing order (manager)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("add a service to a zaplatena order; pay it; original lines stay paid", async ({
    page,
  }) => {
    const db = serviceClient();
    // Pin into the safe 11:00–12:45 window so adding another 60-min service
    // still fits within the seeded 17:00 close and doesn't overlap fixtures
    // from other suites.
    const o = await seedOrder({ status: "zaplatena", time: "11:00" });
    // Mark the original line paid (a paid order would normally have all
    // lines paid before transition).
    await db
      .from("order_services")
      .update({ paid: true })
      .eq("id", o.serviceLineId);

    await page.goto(`/orders/${o.orderId}`);

    // Pick a deterministic second service that is always seeded active
    // and priced for 'os'. Avoids flake when other tests deactivate
    // catalog entries earlier in the run.
    const { data: candidate } = await db
      .from("services")
      .select("id, name")
      .eq("name", "Exteriér Classic")
      .single();
    expect(candidate).not.toBeNull();
    // Re-activate if a prior test left it inactive.
    await db.from("services").update({ active: true }).eq("id", candidate!.id);

    // Add it via the UI.
    await page.locator("#add-service").click();
    await page.getByRole("option", { name: candidate!.name }).click();
    await page
      .getByRole("button", { name: "Pridať službu" })
      .click();
    await expect(page.getByText("Služba pridaná.")).toBeVisible();

    // The new line exists and is unpaid; original stays paid.
    const { data: lines } = await db
      .from("order_services")
      .select("id, service_id, paid, removed_at")
      .eq("order_id", o.orderId)
      .order("added_at");
    expect(lines!.length).toBe(2);
    expect(lines![0].paid).toBe(true);
    expect(lines![1].paid).toBe(false);

    // Pay the new line via the UI.
    await page
      .locator(`[data-service-line-id="${lines![1].id}"]`)
      .locator('input[type="checkbox"]')
      .click();
    await expect(page.getByText("Platba zmenená.")).toBeVisible();
    const { data: after } = await db
      .from("order_services")
      .select("paid")
      .eq("id", lines![1].id)
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
});
