import { test, expect } from "@playwright/test";
import { accessHeaders, expandSidebar, MANAGER_EMAIL, WORKER_EMAIL, seedOrder } from "./support";

/** Bratislava-local today key, matching the app. */
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());
}

test.describe("calendar header & controls (manager, desktop)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("default load is today, Day view, with DNES and the full legend", async ({ page }) => {
    await page.goto("/");
    // Day view: box columns present, no week day-cells.
    await expect(page.locator('[data-box="1"]').first()).toBeVisible();
    await expect(page.locator("[data-day]")).toHaveCount(0);
    // Today state.
    await expect(page.locator("[data-today-pill]")).toBeVisible();
    await expect(page.locator("[data-today-button]")).toHaveCount(0);
    // Legend: four full labels on desktop.
    const legend = page.locator("[data-status-legend]");
    for (const label of ["Vytvorená", "Hotová", "Zaplatená", "Nedostavil sa"]) {
      await expect(legend.getByText(label, { exact: true })).toBeVisible();
    }
    // No mobile box filter on desktop.
    await expect(page.locator("[data-box-filter]")).toBeHidden();
    // Identity is NOT in the header on desktop (the sidebar footer carries it).
    await expect(page.locator("[data-identity]")).toBeHidden();
    // Nová rezervácia lives in the sidebar nav on desktop (the calendar header
    // is mobile-only now, so there is no header action button here). The desktop
    // sidebar is collapsed by default → expand it first.
    await expandSidebar(page);
    await expect(
      page
        .getByRole("navigation", { name: "Bočná navigácia" })
        .getByRole("link", { name: "Nová rezervácia" }),
    ).toHaveAttribute("href", /\/orders\/new/);
  });

  test("date label opens a Calendar popover with month + year dropdowns; picking navigates", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("[data-date-trigger]").click();
    // Month + year dropdowns (native selects → combobox role).
    await expect(page.getByRole("combobox")).toHaveCount(2);
    // Pick the 20th of the shown month.
    await page.getByRole("button", { name: /(^|\s)20(\s|\.|$)/ }).first().click();
    await expect(page).toHaveURL(/date=\d{4}-\d{2}-20/);
  });

  test("◀ ▶ step a day; Späť na dnes returns to today", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-today-pill]")).toBeVisible();
    await page.getByRole("button", { name: "Predošlý deň" }).click();
    await expect(page).toHaveURL(/date=/);
    await expect(page.locator("[data-today-pill]")).toHaveCount(0);
    await page.locator("[data-today-button]").click();
    await expect(page).toHaveURL(new RegExp(`date=${todayKey()}`));
    await expect(page.locator("[data-today-pill]")).toBeVisible();
  });

  test("orders outside opening hours render without a NaN height error", async ({ page }) => {
    // Regression: a booking at/after the grid's last slot pushed the day-view
    // card's end slot to rowTop[n+1] (undefined → NaN height). Both edges are
    // covered — 18:00 is after the 17:00 close, 06:00 is before the 08:00 open;
    // seedOrder inserts directly, bypassing the hours check.
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));

    await seedOrder({ date: "2031-03-14", time: "18:00" });
    await seedOrder({ date: "2031-03-14", time: "06:00" });
    await page.goto("/?view=day&date=2031-03-14");
    await expect(page.locator("[data-box]").first()).toBeVisible();

    expect(errors.filter((e) => /NaN|invalid value for the .* css/i.test(e))).toEqual([]);
  });
});

test.describe("calendar — mobile box filter & short legend", () => {
  test.use({
    extraHTTPHeaders: accessHeaders(MANAGER_EMAIL),
    viewport: { width: 360, height: 740 },
  });

  test("box filter switches the single visible box; legend uses short labels", async ({ page }) => {
    await page.goto("/");
    const filter = page.locator("[data-box-filter]");
    await expect(filter).toBeVisible();
    // Identity IS in the header on mobile (no sidebar at this breakpoint).
    await expect(page.locator("[data-identity]")).toBeVisible();
    // Box 1 shown by default, Box 2 hidden.
    await expect(page.locator('[data-box="1"]').first()).toBeVisible();
    await expect(page.locator('[data-box="2"]').first()).toBeHidden();
    // Switch to Box 2.
    await filter.locator('[data-box-option="2"]').click();
    await expect(page.locator('[data-box="2"]').first()).toBeVisible();
    await expect(page.locator('[data-box="1"]').first()).toBeHidden();
    // Shortened legend labels on mobile.
    const legend = page.locator("[data-status-legend]");
    await expect(legend.getByText("Vytv.", { exact: true })).toBeVisible();
    await expect(legend.getByText("Nedost.", { exact: true })).toBeVisible();
  });
});

test.describe("calendar header — role gating", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("prevádzka sees the core controls but no unpaid badge", async ({ page }) => {
    await page.goto("/");
    await expandSidebar(page);
    await expect(
      page
        .getByRole("navigation", { name: "Bočná navigácia" })
        .getByRole("link", { name: "Nová rezervácia" }),
    ).toBeVisible();
    await expect(page.locator("[data-status-legend]")).toBeVisible();
    await expect(page.locator("[data-unpaid-badge]")).toHaveCount(0);
  });
});
