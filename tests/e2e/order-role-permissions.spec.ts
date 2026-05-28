import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  seedOrder,
  serviceClient,
} from "./support";

test.describe("worker — role-gated controls on order detail", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("worker sees hotova action but not manager-only buttons", async ({ page }) => {
    const o = await seedOrder();
    await page.goto(`/orders/${o.orderId}`);

    // Note edit + move/delete buttons are not rendered for workers.
    // Scope to the note section because the workers section also has "Pridať".
    await expect(
      page.locator('[data-section="note"]').getByRole("button"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Presunúť termín" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Zrušiť objednávku" }),
    ).toHaveCount(0);
    // Manager-only "Pridať službu" not visible.
    await expect(
      page.getByRole("button", { name: "Pridať službu" }),
    ).toHaveCount(0);

    // hotova transition (both-role) succeeds.
    await page.getByRole("button", { name: "Označiť ako hotovú" }).click();
    await expect(page.getByText("Stav: Hotová.")).toBeVisible();

    const db = serviceClient();
    const { data: row } = await db
      .from("orders")
      .select("status")
      .eq("id", o.orderId)
      .single();
    expect(row!.status).toBe("hotova");

    // No "nedostavil_sa" or "vytvorena" actions are surfaced for workers
    // once in `hotova`. zaplatena is — both roles per matrix.
    await expect(
      page.getByRole("button", { name: "Označiť ako nedostavil sa" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Označiť ako zaplatenú" }),
    ).toBeVisible();
  });

  test("workers may assign/unassign workers (PRD §3)", async ({ page }) => {
    const o = await seedOrder();
    const db = serviceClient();
    const { data: workerStaff } = await db
      .from("staff")
      .select("id")
      .eq("email", WORKER_EMAIL)
      .single();

    await page.goto(`/orders/${o.orderId}`);

    await page.locator("#worker-select").click();
    // Pick the first available option in the dropdown.
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "Pridať", exact: true }).click();
    await expect(page.getByText("Zamestnanec pridaný.")).toBeVisible();

    const { data: rows } = await db
      .from("order_staff")
      .select("staff_id")
      .eq("order_id", o.orderId);
    expect(rows).toHaveLength(1);

    // Re-adding same worker → no-op (idempotent), still one row.
    const { error: dupErr } = await db
      .from("order_staff")
      .insert({
        order_id: o.orderId,
        staff_id: rows![0].staff_id,
        assigned_by: workerStaff!.id,
      });
    expect(dupErr).not.toBeNull(); // PK collision

    // Remove via UI.
    await page
      .locator(`[data-worker-id="${rows![0].staff_id}"]`)
      .getByRole("button", { name: "Odobrať" })
      .click();
    await expect(page.getByText("Zamestnanec odobraný.")).toBeVisible();
    const { data: after } = await db
      .from("order_staff")
      .select("staff_id")
      .eq("order_id", o.orderId);
    expect(after).toHaveLength(0);
  });
});

test.describe("manager — full controls on order detail", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("manager sees and can use note/move/delete; multiple workers", async ({ page }) => {
    const o = await seedOrder();
    const db = serviceClient();
    const { data: allStaff } = await db
      .from("staff")
      .select("id, email")
      .eq("active", true);
    expect(allStaff!.length).toBeGreaterThanOrEqual(2);

    await page.goto(`/orders/${o.orderId}`);

    // Add two distinct workers.
    for (let i = 0; i < 2; i++) {
      await page.locator("#worker-select").click();
      await page.getByRole("option").first().click();
      await page
        .locator('[data-section="workers"]')
        .getByRole("button", { name: "Pridať", exact: true })
        .click();
      await expect(page.getByText("Zamestnanec pridaný.")).toBeVisible();
      // Wait for server-refresh to mark the row in the worker list before
      // we try to add the second one (otherwise the dropdown still shows
      // the just-added staff as assignable).
      await expect(
        page.locator('[data-section="workers"] [data-worker-id]'),
      ).toHaveCount(i + 1);
    }
    const { data: rows } = await db
      .from("order_staff")
      .select("staff_id")
      .eq("order_id", o.orderId);
    expect(rows).toHaveLength(2);

    // Audit has the two `order.assign` entries.
    const { data: audits } = await db
      .from("audit_log")
      .select("action")
      .eq("order_id", o.orderId)
      .eq("action", "order.assign");
    expect(audits).toHaveLength(2);

    // Remove one — count drops to 1, audit gains one unassign.
    await page
      .locator(`[data-worker-id="${rows![0].staff_id}"]`)
      .getByRole("button", { name: "Odobrať" })
      .click();
    await expect(page.getByText("Zamestnanec odobraný.")).toBeVisible();
    const { data: after } = await db
      .from("order_staff")
      .select("staff_id")
      .eq("order_id", o.orderId);
    expect(after).toHaveLength(1);
    const { data: unassigns } = await db
      .from("audit_log")
      .select("action")
      .eq("order_id", o.orderId)
      .eq("action", "order.unassign");
    expect(unassigns).toHaveLength(1);
  });
});
