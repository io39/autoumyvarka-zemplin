import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  uniquePhone,
  uniqueSpz,
  createClientViaUI,
  addCarViaUI,
  serviceClient,
} from "./support";

test.describe("clients audit", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("create client → client.create; add car → car.create", async ({ page }) => {
    const db = serviceClient();
    const spz = uniqueSpz();

    const clientId = await createClientViaUI(page, { phone: uniquePhone(), name: "Audit Klient" });

    const { data: clientAudit } = await db
      .from("audit_log")
      .select("action, actor_email, entity_type")
      .eq("entity_id", clientId)
      .eq("action", "client.create")
      .single();
    expect(clientAudit).toMatchObject({
      action: "client.create",
      actor_email: MANAGER_EMAIL,
      entity_type: "client",
    });

    await addCarViaUI(page, spz);
    await expect(page.getByText(spz, { exact: true })).toBeVisible();

    const { data: car } = await db.from("cars").select("id").eq("spz", spz).single();
    const { data: carAudit } = await db
      .from("audit_log")
      .select("action, actor_email, entity_type")
      .eq("entity_id", car!.id)
      .eq("action", "car.create")
      .single();
    expect(carAudit).toMatchObject({
      action: "car.create",
      actor_email: MANAGER_EMAIL,
      entity_type: "car",
    });
  });
});
