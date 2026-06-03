import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, serviceClient } from "./support";

test.describe("audit log — services", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("create + deactivate write service.create and service.deactivate audit entries", async ({ page }) => {
    const name = `Audit služba ${Date.now()}`;

    await page.goto("/services");
    await page.getByRole("button", { name: "Pridať službu" }).click();
    await page.getByLabel("Názov").fill(name);
    await page.getByLabel("Cena (€)").fill("15,00");
    await page.getByLabel("Trvanie (min)").fill("30");
    await page.getByRole("button", { name: "Pridať" }).click();

    const card = page.locator("article").filter({ hasText: name });
    await expect(card).toBeVisible();

    const db = serviceClient();
    const { data: svc } = await db
      .from("services")
      .select("id")
      .eq("name", name)
      .single();
    expect(svc?.id).toBeTruthy();

    const { data: createAudit } = await db
      .from("audit_log")
      .select("action, actor_email, entity_type, entity_id")
      .eq("entity_id", svc!.id)
      .eq("action", "service.create")
      .single();
    expect(createAudit).toMatchObject({
      action: "service.create",
      actor_email: MANAGER_EMAIL,
      entity_type: "service",
      entity_id: svc!.id,
    });

    // Deactivate via UI and assert before/after recorded.
    await card.getByRole("button", { name: "Deaktivovať" }).click();
    // Inactive services are hidden by default; reveal them to see the card again.
    await page.getByRole("button", { name: "Zobraziť neaktívne" }).click();
    await expect(card.getByText("Neaktívna")).toBeVisible();

    const { data: deactAudit } = await db
      .from("audit_log")
      .select("action, details")
      .eq("entity_id", svc!.id)
      .eq("action", "service.deactivate")
      .single();
    expect(deactAudit?.details).toMatchObject({
      from: { active: true },
      to: { active: false },
    });
  });

  test("editing a price writes a service.price_update audit entry", async ({ page }) => {
    // Create a service via DB so we have a clean target row.
    const db = serviceClient();
    const name = `Audit cena ${Date.now()}`;
    const { data: svc } = await db
      .from("services")
      .insert({ name, kind: "main", sort_order: 999 })
      .select("id")
      .single();
    await db.from("service_prices").insert({
      service_id: svc!.id,
      pricing_category: "os",
      duration_min: 30,
      price_cents: 1000,
    });

    await page.goto(`/services/${svc!.id}`);

    // The "Os." row inputs are labeled by category id (dur-os, price-os).
    const row = page.locator('[data-category="os"]');
    await row.getByLabel("Cena (€)").fill("12,50");
    await row.getByRole("button", { name: "Uložiť" }).click();

    // Wait for the upsert to land.
    await expect.poll(async () => {
      const { data } = await db
        .from("audit_log")
        .select("id, details")
        .eq("entity_id", svc!.id)
        .eq("action", "service.price_update");
      return data?.length ?? 0;
    }).toBeGreaterThan(0);

    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("entity_id", svc!.id)
      .eq("action", "service.price_update")
      .single();
    expect(audit?.details).toMatchObject({
      category: "os",
      from: { price_cents: 1000 },
      to: { price_cents: 1250 },
    });
  });
});
