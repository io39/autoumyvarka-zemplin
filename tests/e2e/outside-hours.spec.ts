import { test, expect } from "@playwright/test";
import { accessHeaders, expandSidebar, MANAGER_EMAIL, WORKER_EMAIL, seedOrder, serviceClient } from "./support";

/** Date (YYYY-MM-DD, Bratislava) of the next occurrence of `dow` (0=Mon…6=Sun), ≥ 8 days out. */
function nextWeekdayDate(dow: number): string {
  for (let d = 8; d <= 21; d++) {
    const t = new Date(Date.now() + d * 86_400_000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(t);
    const [y, m, dd] = key.split("-").map(Number);
    const js = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); // 0=Sun…6=Sat
    if ((js + 6) % 7 === dow) return key;
  }
  throw new Error("no matching weekday found");
}

test.describe("outside-hours worklist (manager)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("an upcoming order whose time is outside hours appears on /mimo-hodin", async ({ page }) => {
    const o = await seedOrder({ date: "2031-03-14", time: "18:00" }); // after 17:00 close
    await page.goto("/mimo-hodin");
    const row = page.locator(`[data-section="outside-hours"] [data-order-id="${o.orderId}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByRole("link")).toHaveAttribute("href", `/orders/${o.orderId}`);
  });

  test("the badge shows the count and links to /mimo-hodin", async ({ page }) => {
    await seedOrder({ date: "2031-03-14", time: "18:00" });
    await page.goto("/");
    await expandSidebar(page); // desktop sidebar is collapsed by default
    // The badge exists in two breakpoint slots (desktop sidebar / mobile calendar
    // header); scope to the visible one for this desktop-viewport run.
    const badge = page.locator("[data-outside-hours-badge]:visible");
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

    await expect(row).toHaveCount(0, { timeout: 20000 });
  });

  test("an out-of-hours order's calendar card carries the mimo-hodín marker", async ({ page }) => {
    const o = await seedOrder({ date: "2031-03-14", time: "18:00" }); // after 17:00 close
    await page.goto("/?view=day&date=2031-03-14");
    const card = page.locator(`[data-order-id="${o.orderId}"]`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-outside-hours", "");
  });

  test("a card on a fully-closed day is marked in day view too", async ({ page }) => {
    // 2031-03-16 is a Sunday (seed: Sun closed). A 09:00 order would look fine
    // against the default grid — the marker must still flag it (closed day).
    const o = await seedOrder({ date: "2031-03-16", time: "09:00" });
    await page.goto("/?view=day&date=2031-03-16");
    const card = page.locator(`[data-order-id="${o.orderId}"]`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-outside-hours", "");
  });

  test("narrowing a day's hours warns about an existing order, then allows on confirm", async ({ page }) => {
    const date = nextWeekdayDate(2); // next Wednesday (open 08:00–17:00)
    const o = await seedOrder({ date, time: "09:00" });

    await page.goto("/settings/hours");
    const wed = page.locator('[data-day="2"]'); // opening_hours: 0=Mon → Wed=2
    const closed = wed.getByRole("checkbox");
    if (!(await closed.isChecked())) await closed.check();
    await page.getByRole("button", { name: "Uložiť", exact: true }).first().click();

    await expect(page.getByRole("heading", { name: "Objednávky mimo otváracích hodín" })).toBeVisible();
    await page.locator("[data-outside-hours-confirm]").click();
    await expect(page.getByText("Otváracie hodiny uložené.")).toBeVisible();

    await page.goto("/mimo-hodin");
    await expect(page.locator(`[data-section="outside-hours"] [data-order-id="${o.orderId}"]`)).toBeVisible();

    // Restore Wednesday open so other suites aren't affected.
    await page.goto("/settings/hours");
    const wed2 = page.locator('[data-day="2"]');
    const c2 = wed2.getByRole("checkbox");
    if (await c2.isChecked()) await c2.uncheck();
    await wed2.locator('input[type="time"]').first().fill("08:00");
    await wed2.locator('input[type="time"]').last().fill("17:00");
    await page.getByRole("button", { name: "Uložiť", exact: true }).first().click();
    await expect(page.getByText("Otváracie hodiny uložené.")).toBeVisible();
  });
});

test.describe("outside-hours worklist — worker gating", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("prevádzka gets the 403 view on /mimo-hodin", async ({ page }) => {
    await page.goto("/mimo-hodin");
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
  });
});
