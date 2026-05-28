import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { accessHeaders, MANAGER_EMAIL, serviceClient } from "./support";

const todayBratislava = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());

async function visibleIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-section="audit"] tr[data-id]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-id") ?? ""));
}

test.describe("audit filters & keyset pagination (spec 09 §4.3)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("filters by order, action, and date range", async ({ page }) => {
    const db = serviceClient();
    const orderId = randomUUID();
    const otherOrderId = randomUUID();
    const oldId = randomUUID();

    // NB: PostgREST bulk insert requires identical keys across all rows, so
    // every row sets created_at explicitly (recent for three, 2020 for the old).
    const now = new Date().toISOString();
    await db.from("audit_log").insert([
      // Recent rows for our order, mixed actions.
      {
        id: randomUUID(),
        actor_email: MANAGER_EMAIL,
        action: "order.status_change",
        entity_type: "order",
        order_id: orderId,
        details: { from: "vytvorena", to: "hotova" },
        created_at: now,
      },
      {
        id: randomUUID(),
        actor_email: MANAGER_EMAIL,
        action: "order.note_edit",
        entity_type: "order",
        order_id: orderId,
        details: { from: null, to: "x" },
        created_at: now,
      },
      // A row for a DIFFERENT order — must never show under ?orderId=orderId.
      {
        id: randomUUID(),
        actor_email: MANAGER_EMAIL,
        action: "order.status_change",
        entity_type: "order",
        order_id: otherOrderId,
        details: { from: "vytvorena", to: "hotova" },
        created_at: now,
      },
      // A very OLD row for our order — excluded by a recent `from` date.
      {
        id: oldId,
        actor_email: MANAGER_EMAIL,
        action: "order.create",
        entity_type: "order",
        order_id: orderId,
        details: { box: 1 },
        created_at: "2020-01-01T10:00:00+00:00",
      },
    ]);

    // orderId filter: only our order's three rows; the other order's row absent.
    await page.goto(`/audit?orderId=${orderId}`);
    let ids = await visibleIds(page);
    expect(ids).toHaveLength(3);

    // action filter: only order.status_change rows remain.
    await page.locator("#action").click();
    await page.getByRole("option", { name: "Zmena stavu", exact: true }).click();
    await expect(page.locator('[data-section="audit"] tr[data-action]')).toHaveCount(1);
    const actions = await page
      .locator('[data-section="audit"] tr[data-action]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
    expect(actions).toEqual(["order.status_change"]);

    // Clear, then date filter from today → the 2020 row drops out.
    await page.getByRole("button", { name: "Vymazať filtre" }).click();
    await expect(page.locator('[data-section="audit"] tr[data-id]')).toHaveCount(3);
    await page.locator("#from").fill(todayBratislava());
    await expect(page.locator(`[data-section="audit"] tr[data-id="${oldId}"]`)).toHaveCount(0);
    ids = await visibleIds(page);
    expect(ids).toHaveLength(2);
  });

  test("keyset pagination: no duplicates or gaps when a row is inserted between pages", async ({
    page,
  }) => {
    const db = serviceClient();
    const orderId = randomUUID();

    // 51 rows (> one 50-row page), strictly decreasing created_at so order is stable.
    const base = Date.now();
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: randomUUID(),
      actor_email: MANAGER_EMAIL,
      action: "order.status_change",
      entity_type: "order",
      order_id: orderId,
      details: { from: "vytvorena", to: "hotova" },
      created_at: new Date(base - i * 1000).toISOString(),
    }));
    await db.from("audit_log").insert(rows);
    const originalIds = new Set(rows.map((r) => r.id));

    await page.goto(`/audit?orderId=${orderId}`);
    const page1 = await visibleIds(page);
    expect(page1).toHaveLength(50);

    // Insert a NEWER row between page loads — keyset must not duplicate or skip.
    const insertedId = randomUUID();
    await db.from("audit_log").insert({
      id: insertedId,
      actor_email: MANAGER_EMAIL,
      action: "order.status_change",
      entity_type: "order",
      order_id: orderId,
      details: { from: "vytvorena", to: "hotova" },
      created_at: new Date(base + 60_000).toISOString(),
    });

    await page.getByRole("button", { name: "Načítať ďalšie" }).click();
    await expect(page.locator('[data-section="audit"] tr[data-id]')).toHaveCount(51);

    const all = await visibleIds(page);
    expect(new Set(all).size).toBe(all.length); // no duplicates
    // All 51 originals present (no gap); the newer row is NOT pulled into page 2.
    for (const id of originalIds) expect(all).toContain(id);
    expect(all).not.toContain(insertedId);
  });
});
