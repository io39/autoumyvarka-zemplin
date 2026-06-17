import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  uniquePhone,
  uniqueSpz,
  createClientViaUI,
  addCarViaUI,
  seedOrderFor,
  seedClientWithCar,
  serviceClient,
} from "./support";

test.describe("car merge — setting a colliding plate (spec 02 §2.6)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("merge folds the edited car into the existing plated car", async ({ page }) => {
    const db = serviceClient();
    const spzX = uniqueSpz("MX");
    const spzY = uniqueSpz("MY");

    // Two clients, each with their own plated car + one order. Wait for each
    // car to render before reading the DB — addCarViaUI returns on click, before
    // the Server Action has committed the row.
    const idA = await createClientViaUI(page, { phone: uniquePhone(), name: "Merge A" });
    await addCarViaUI(page, spzX);
    await expect(page.getByText(spzX, { exact: true }).first()).toBeVisible();
    const idB = await createClientViaUI(page, { phone: uniquePhone(), name: "Merge B" });
    await addCarViaUI(page, spzY);
    await expect(page.getByText(spzY, { exact: true }).first()).toBeVisible();

    const { data: carX } = await db.from("cars").select("id").eq("spz", spzX).single();
    const { data: carY } = await db.from("cars").select("id").eq("spz", spzY).single();
    await seedOrderFor({ clientId: idA, carId: carX!.id });
    await seedOrderFor({ clientId: idB, carId: carY!.id });

    // Edit car X (under client A) and set its plate to Y's → merge confirm.
    await page.goto(`/clients?id=${idA}`);
    await page.getByRole("button", { name: "Upraviť auto" }).click();
    await page.getByLabel("ŠPZ").fill(spzY);
    await page.getByRole("button", { name: "Uložiť" }).click();

    // Confirm dialog names both cars, the survivor's owner, and the consequence.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Spojiť autá")).toBeVisible();
    await expect(dialog.getByText(/patrí klientovi/)).toBeVisible();
    await expect(dialog.getByText("Merge B", { exact: true })).toBeVisible(); // the survivor's owner
    await expect(dialog.getByText(/sa nedá vrátiť/)).toBeVisible();
    await page.getByRole("button", { name: "Spojiť" }).click();

    // Dialog closes on success (onSaved → setEditCar(null) + refresh). Wait on the
    // title, not the button — the button's label flips to "Spájam…" mid-transition.
    await expect(page.getByText("Spojiť autá")).toBeHidden();

    // Y survives, X is gone.
    const { count: yCount } = await db
      .from("cars")
      .select("*", { count: "exact", head: true })
      .eq("id", carY!.id);
    expect(yCount).toBe(1);
    const { count: xCount } = await db
      .from("cars")
      .select("*", { count: "exact", head: true })
      .eq("id", carX!.id);
    expect(xCount).toBe(0);

    // Both orders now hang off Y.
    const { count: ordersOnY } = await db
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("car_id", carY!.id);
    expect(ordersOnY).toBe(2);

    // Both clients are linked to Y (no duplicate link).
    const { data: linksY } = await db.from("client_cars").select("client_id").eq("car_id", carY!.id);
    expect(new Set(linksY?.map((l) => l.client_id))).toEqual(new Set([idA, idB]));

    // car.merge audited on the survivor with the reassigned-order count.
    const { data: mergeAudit } = await db
      .from("audit_log")
      .select("action, entity_id, details")
      .eq("entity_id", carY!.id)
      .eq("action", "car.merge")
      .limit(1)
      .maybeSingle();
    expect(mergeAudit?.action).toBe("car.merge");
    const details = mergeAudit?.details as { reassigned_orders?: number; merged_clients?: number };
    expect(details?.reassigned_orders).toBe(1);
    // Client A newly gained the survivor; B already owned it → 1 link actually added.
    expect(details?.merged_clients).toBe(1);
  });

  test("cancelling the merge leaves both cars untouched", async ({ page }) => {
    const db = serviceClient();
    const spzX = uniqueSpz("CX");
    const spzY = uniqueSpz("CY");

    const idA = await createClientViaUI(page, { phone: uniquePhone(), name: "Cancel A" });
    await addCarViaUI(page, spzX);
    await expect(page.getByText(spzX, { exact: true }).first()).toBeVisible();
    await createClientViaUI(page, { phone: uniquePhone(), name: "Cancel B" });
    await addCarViaUI(page, spzY);
    await expect(page.getByText(spzY, { exact: true }).first()).toBeVisible();

    await page.goto(`/clients?id=${idA}`);
    await page.getByRole("button", { name: "Upraviť auto" }).click();
    await page.getByLabel("ŠPZ").fill(spzY);
    await page.getByRole("button", { name: "Uložiť" }).click();
    await expect(page.getByText("Spojiť autá")).toBeVisible();
    await page.getByRole("button", { name: "Zrušiť" }).click();

    // Both car rows still exist with their original plates.
    const { count: xCount } = await db
      .from("cars")
      .select("*", { count: "exact", head: true })
      .eq("spz", spzX);
    const { count: yCount } = await db
      .from("cars")
      .select("*", { count: "exact", head: true })
      .eq("spz", spzY);
    expect(xCount).toBe(1);
    expect(yCount).toBe(1);
  });
});

test.describe("car merge — worker (prevadzka)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("the merge is unreachable — a worker has no edit-car control", async ({ page }) => {
    // updateCar (and therefore the merge) is requireManager-gated; a worker can't
    // even open the edit dialog, so the merge confirm is never reachable (§4.10).
    const { clientId, carId } = await seedClientWithCar();
    await page.goto(`/clients?id=${clientId}`);
    await expect(page.locator(`[data-car-id="${carId}"]`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Upraviť auto" })).toHaveCount(0);
  });
});
