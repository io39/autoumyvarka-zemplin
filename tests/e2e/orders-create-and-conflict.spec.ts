import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  serviceClient,
  uniquePhone,
  uniqueSpz,
} from "./support";
import { bratislavaLocalToISO } from "@/lib/time/bratislava";

/** Pick a Bratislava-local date and 09:00 / 09:30 slot. Use a near-future
 * weekday so the seeded opening hours (Mon–Fri 08:00–17:00) apply. */
function nextWeekdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() + 1);
  if (dow === 6) d.setDate(d.getDate() + 2);
  // Format as Bratislava local YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(d);
}

async function setupClientAndCar(spzPrefix = "TT") {
  const db = serviceClient();
  const phone = `+421${uniquePhone().slice(1)}`;
  const { data: client } = await db
    .from("clients")
    .insert({ phone, name: "E2E klient" })
    .select("id")
    .single();
  const { data: car } = await db
    .from("cars")
    .insert({ spz: uniqueSpz(spzPrefix), pricing_category: "os" })
    .select("id, spz")
    .single();
  await db.from("client_cars").insert({ client_id: client!.id, car_id: car!.id });

  // Pick an active main service that has an "os" price row.
  const { data: service } = await db
    .from("services")
    .select("id, name")
    .eq("active", true)
    .eq("kind", "main")
    .eq("name", "Interiér Classic")
    .single();

  return { clientId: client!.id, carId: car!.id, spz: car!.spz, serviceId: service!.id };
}

test.describe("manager — booking flow", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("creates an order; second overlapping order in the same box is rejected; different box succeeds", async ({ page }) => {
    const { clientId, spz, serviceId } = await setupClientAndCar();
    const date = nextWeekdayDate();
    const db = serviceClient();
    const { data: staff } = await db
      .from("staff")
      .select("id")
      .eq("email", MANAGER_EMAIL)
      .single();

    // First order: box 1, 09:00 → 60 min (Interiér Classic / os).
    await page.goto(`/orders/new?clientId=${clientId}&date=${date}`);
    await page.locator("#date").fill(date);
    await page.locator("#time").fill("09:00");
    // Tick the seeded "Interiér Classic" service.
    await page.locator(`[data-service-id="${serviceId}"]`).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Vytvoriť" }).click();
    await page.waitForURL(/\/\?date=/);
    await expect(page.getByText("Objednávka vytvorená.")).toBeVisible();

    // The calendar block for that ŠPZ is on the page.
    await expect(page.getByText(spz)).toBeVisible();

    // Second order: same box 1, 09:30 (overlaps the 09:00–10:00 slot) → rejected.
    await page.goto(`/orders/new?clientId=${clientId}&date=${date}`);
    await page.locator("#date").fill(date);
    await page.locator("#time").fill("09:30");
    await page.locator(`[data-service-id="${serviceId}"]`).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Vytvoriť" }).click();
    await expect(page.getByText("Termín v tomto boxe je obsadený.")).toBeVisible();

    // Same 09:30 in Box 2 → succeeds.
    await page.getByLabel("Box").click();
    await page.getByRole("option", { name: "Box 2" }).click();
    await page.getByRole("button", { name: "Vytvoriť" }).click();
    await page.waitForURL(/\/\?date=/);
    await expect(page.getByText("Objednávka vytvorená.")).toBeVisible();

    // Direct DB sanity check: exactly two non-deleted orders for this client.
    const { data: rows } = await db
      .from("orders")
      .select("box, starts_at")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("starts_at");
    expect(rows).toHaveLength(2);
    // After soft-deleting the box-1 order, the 09:30 box-1 slot frees up.
    const { error } = await db
      .from("orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .eq("box", 1);
    expect(error).toBeNull();
    const { error: ins } = await db.from("orders").insert({
      client_id: clientId,
      car_id: (await db.from("client_cars").select("car_id").eq("client_id", clientId).single()).data!.car_id,
      box: 1,
      starts_at: bratislavaLocalToISO(date, "09:30"),
      duration_min: 30,
      ends_at: bratislavaLocalToISO(date, "10:00"),
      created_by: staff!.id,
    });
    expect(ins).toBeNull();
  });

  test("rejects a start outside opening hours", async ({ page }) => {
    const { clientId, serviceId } = await setupClientAndCar("OH");
    const date = nextWeekdayDate();

    // 21:00 is past close_time (17:00 seeded).
    await page.goto(`/orders/new?clientId=${clientId}&date=${date}`);
    await page.locator("#date").fill(date);
    await page.locator("#time").fill("21:00");
    await page.locator(`[data-service-id="${serviceId}"]`).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Vytvoriť" }).click();
    await expect(page.getByText("Termín je mimo otváracích hodín.")).toBeVisible();
  });

});

test.describe("worker (prevadzka) — booking", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("can create an order (workers may book — PRD §3)", async ({ page }) => {
    const { clientId, serviceId } = await setupClientAndCar("WK");
    const date = nextWeekdayDate();

    await page.goto(`/orders/new?clientId=${clientId}&date=${date}`);
    await page.locator("#date").fill(date);
    await page.locator("#time").fill("13:00");
    await page.locator(`[data-service-id="${serviceId}"]`).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Vytvoriť" }).click();
    await page.waitForURL(/\/\?date=/);
    await expect(page.getByText("Objednávka vytvorená.")).toBeVisible();
  });
});
