import { test, expect } from "@playwright/test";
import { accessHeaders, expandSidebar, MANAGER_EMAIL, WORKER_EMAIL, seedOrder, serviceClient } from "./support";

test.describe("outside-hours worklist (manager)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("an upcoming order whose time is outside hours appears on /mimo-hodin", async ({ page }) => {
    const o = await seedOrder({ date: "2031-03-14", time: "18:00" }); // after 17:00 close
    await page.goto("/mimo-hodin");
    const row = page.locator(`[data-section="outside-hours"] [data-order-id="${o.orderId}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByRole("link")).toHaveAttribute("href", `/orders/${o.orderId}`);
  });

  test("the sidebar badge shows the count and links to /mimo-hodin", async ({ page }) => {
    await seedOrder({ date: "2031-03-14", time: "18:00" });
    await page.goto("/");
    await expandSidebar(page); // desktop sidebar is collapsed by default
    const badge = page.locator("[data-outside-hours-badge]");
    await expect(badge).toBeVisible();
    expect(Number(await badge.getAttribute("data-count"))).toBeGreaterThanOrEqual(1);
    await badge.click();
    await page.waitForURL(/\/mimo-hodin$/);
  });

  test("rescheduling an order into open hours drops it from the list live", async ({ page }) => {
    const o = await seedOrder({ date: "2031-03-14", time: "18:00" });
    await page.goto("/mimo-hodin");
    const row = page.locator(`[data-section="outside-hours"] [data-order-id="${o.orderId}"]`);
    await expect(row).toBeVisible();

    const db = serviceClient();
    const startsAt = new Date("2031-03-14T08:00:00Z"); // 09:00 Bratislava (CET +01:00)
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const { error } = await db
      .from("orders")
      .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
      .eq("id", o.orderId);
    expect(error).toBeNull();

    await expect(row).toHaveCount(0);
  });
});

test.describe("outside-hours worklist — worker gating", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("prevádzka gets the 403 view on /mimo-hodin", async ({ page }) => {
    await page.goto("/mimo-hodin");
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
  });
});
