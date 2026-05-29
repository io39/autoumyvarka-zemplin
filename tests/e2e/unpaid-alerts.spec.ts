import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  serviceClient,
  seedDatedOrder,
  bratislavaDateOffset,
} from "./support";

test.describe("unpaid alerts — badge, list, live update (spec 10 §4.3)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("overdue + today orders surface in the badge, banner and list (overdue first)", async ({
    page,
  }) => {
    // Overdue: hotova two days ago. Today: hotova today (unpaid, not overdue).
    const overdue = await seedDatedOrder({ date: bratislavaDateOffset(-2), status: "hotova" });
    const todayOrder = await seedDatedOrder({ date: bratislavaDateOffset(0), status: "hotova" });

    // Home header badge is present for the manager (overdue count ≥ 1).
    await page.goto("/");
    const badge = page.locator("[data-unpaid-badge]");
    await expect(badge).toBeVisible();
    expect(Number(await badge.getAttribute("data-count"))).toBeGreaterThanOrEqual(1);

    // /unpaid lists both, banner mentions previous-day unpaid, overdue row first.
    await badge.click();
    await page.waitForURL(/\/unpaid$/);
    await expect(page.locator('[data-banner="overdue"]')).toContainText("z minulých dní");

    const overdueRow = page.locator(`[data-spz="${overdue.spz}"]`);
    const todayRow = page.locator(`[data-spz="${todayOrder.spz}"]`);
    await expect(overdueRow).toBeVisible();
    await expect(todayRow).toBeVisible();
    await expect(overdueRow).toContainText("Po termíne");
    await expect(todayRow).toContainText("Dnes");
    // The unpaid-amount sum is shown (one Interiér Classic line, os = 18,90 €).
    await expect(overdueRow).toContainText("18,90");
    // Each row links to its order detail.
    await expect(overdueRow.getByRole("link")).toHaveAttribute(
      "href",
      `/orders/${overdue.orderId}`,
    );

    // Overdue sorts before today in the table body.
    const spzOrder = await page
      .locator('[data-section="unpaid"] tbody tr[data-spz]')
      .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-spz")));
    expect(spzOrder.indexOf(overdue.spz)).toBeLessThan(spzOrder.indexOf(todayOrder.spz));
  });

  test("paying an order's line removes it from the list and decrements the count live", async ({
    page,
  }) => {
    // zaplatena (so the status signal is off) + one unpaid line, dated in the
    // past → unpaid+overdue purely via the line. Paying the line clears it,
    // independent of the status-cascade question.
    const order = await seedDatedOrder({
      date: bratislavaDateOffset(-2),
      status: "zaplatena",
      linePaid: false,
    });

    await page.goto("/unpaid");
    const row = page.locator(`[data-order-id="${order.orderId}"]`);
    await expect(row).toBeVisible();
    const before = Number(await page.locator("[data-overdue-count]").textContent());
    expect(before).toBeGreaterThanOrEqual(1);

    // Mark the line paid out-of-band → Realtime should drop the row, no reload.
    const { error } = await serviceClient()
      .from("order_services")
      .update({ paid: true })
      .eq("id", order.lineId);
    expect(error).toBeNull();

    await expect(row).toHaveCount(0);
    await expect(page.locator("[data-overdue-count]")).toHaveText(String(before - 1));
  });
});
