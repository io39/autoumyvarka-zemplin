import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  uniquePhone,
  uniqueSpz,
  createClientViaUI,
  serviceClient,
} from "./support";

test.describe("plateless cars (optional ŠPZ)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("add a car with no ŠPZ, then set its plate later", async ({ page }) => {
    const db = serviceClient();
    const model = `Plateless-${Date.now()}`;
    const phone = uniquePhone();

    // Create a client, then add a car with NO ŠPZ — identified by model only.
    await createClientViaUI(page, { phone, name: "Plateless Owner" });
    await page.getByRole("button", { name: "Pridať auto" }).click();
    // Leave ŠPZ empty; the brand-or-model rule is satisfied by the model.
    await page.getByLabel("Model").fill(model);
    await page.getByRole("button", { name: "Pridať" }).click();

    // The plateless car shows by its model (formatCarPrimary fallback).
    await expect(page.getByText(model, { exact: true }).first()).toBeVisible();

    // DB: exactly one car row, spz NULL, linked once.
    const { data: car } = await db
      .from("cars")
      .select("id, spz")
      .eq("model", model)
      .single();
    expect(car?.id).toBeTruthy();
    expect(car?.spz).toBeNull();
    const { count: links } = await db
      .from("client_cars")
      .select("*", { count: "exact", head: true })
      .eq("car_id", car!.id);
    expect(links).toBe(1);

    // Manager sets a plate later via "Upraviť auto" → re-running the form.
    const spz = uniqueSpz("PL");
    await page.getByRole("button", { name: "Upraviť auto" }).click();
    await page.getByLabel("ŠPZ").fill(spz);
    await page.getByRole("button", { name: "Uložiť" }).click();
    await expect(page.getByText(spz, { exact: true }).first()).toBeVisible();

    // DB: same car row now carries the normalized plate.
    const { data: updated } = await db.from("cars").select("spz").eq("id", car!.id).single();
    expect(updated?.spz).toBe(spz);
  });

  test("two plateless cars do not link to each other", async ({ page }) => {
    const db = serviceClient();
    const modelA = `Solo-A-${Date.now()}`;
    const modelB = `Solo-B-${Date.now()}`;

    const idA = await createClientViaUI(page, { phone: uniquePhone(), name: "Solo A" });
    await page.getByRole("button", { name: "Pridať auto" }).click();
    await page.getByLabel("Model").fill(modelA);
    await page.getByRole("button", { name: "Pridať" }).click();
    await expect(page.getByText(modelA, { exact: true }).first()).toBeVisible();

    const idB = await createClientViaUI(page, { phone: uniquePhone(), name: "Solo B" });
    await page.getByRole("button", { name: "Pridať auto" }).click();
    await page.getByLabel("Model").fill(modelB);
    await page.getByRole("button", { name: "Pridať" }).click();
    await expect(page.getByText(modelB, { exact: true }).first()).toBeVisible();

    // Two distinct car rows, each linked to exactly its own client.
    const { data: a } = await db.from("cars").select("id").eq("model", modelA).single();
    const { data: b } = await db.from("cars").select("id").eq("model", modelB).single();
    expect(a!.id).not.toBe(b!.id);
    const { data: linksA } = await db.from("client_cars").select("client_id").eq("car_id", a!.id);
    const { data: linksB } = await db.from("client_cars").select("client_id").eq("car_id", b!.id);
    expect(linksA?.map((l) => l.client_id)).toEqual([idA]);
    expect(linksB?.map((l) => l.client_id)).toEqual([idB]);
  });
});
