import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, WORKER_EMAIL } from "./support";

const PREVADZKA = ["Kalendár", "Nová rezervácia", "Zákazníci"];
const SPRAVA: Array<{ label: string; path: string }> = [
  { label: "Správa zamestnancov", path: "/staff" },
  { label: "Katalóg služieb", path: "/services" },
  { label: "Otváracie hodiny", path: "/settings/hours" },
  { label: "SMS šablóny", path: "/settings/sms-templates" },
  { label: "Záznam zmien", path: "/audit" },
];

test.describe("manager — desktop sidebar", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("sidebar shows the 3 PREVÁDZKA items + the SPRÁVA burger", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("aside");
    for (const label of PREVADZKA) {
      await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(sidebar.getByRole("button", { name: "Správa" })).toBeVisible();
  });

  test("exactly one <main> is rendered", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toHaveCount(1);
  });

  test("active item reflects the current route", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("aside");
    // On the calendar root, Kalendár is current; the others are not.
    await expect(sidebar.getByRole("link", { name: "Kalendár" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(sidebar.getByRole("link", { name: "Zákazníci" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );

    await sidebar.getByRole("link", { name: "Zákazníci" }).click();
    await page.waitForURL("**/clients");
    await expect(sidebar.getByRole("link", { name: "Zákazníci" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("SPRÁVA burger lists all 5 admin items and each navigates", async ({ page }) => {
    for (const { label, path } of SPRAVA) {
      await page.goto("/");
      await page.locator("aside").getByRole("button", { name: "Správa" }).click();
      const item = page.getByRole("menuitem", { name: label });
      await expect(item).toBeVisible();
      await item.click();
      await page.waitForURL(`**${path}`);
      expect(new URL(page.url()).pathname).toBe(path);
    }
  });
});

test.describe("prevádzka — no SPRÁVA", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("desktop sidebar shows only the 3 core items, no burger", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("aside");
    for (const label of PREVADZKA) {
      await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(sidebar.getByRole("button", { name: "Správa" })).toHaveCount(0);
  });

  test("mobile bottom nav shows only the 3 core items, no burger", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    const bottomNav = page.getByRole("navigation", { name: "Spodná navigácia" });
    for (const label of PREVADZKA) {
      await expect(bottomNav.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(bottomNav.getByRole("button", { name: "Správa" })).toHaveCount(0);
  });

  test("a manager-only page shows the 403 in-shell with exactly one <main>", async ({ page }) => {
    // The worker has a valid identity, so the shell renders; the page's 403 view
    // must sit inside the shell's single <main>, not nest a second one.
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "Nemáte oprávnenie" })).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
    // The sidebar nav is still present so the worker can navigate away.
    await expect(page.locator("aside").getByRole("link", { name: "Kalendár" })).toBeVisible();
  });
});

test.describe("no identity — chrome-less passthrough", () => {
  // An edge identity that maps to no active staff row → 401 view, no shell.
  test.use({ extraHTTPHeaders: accessHeaders("nobody-" + Date.now() + "@test.local") });

  test("renders the full-screen 401 view with no nav chrome", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Neoverená identita" })).toBeVisible();
    // No sidebar / bottom-nav landmarks at all.
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    // The 401 view provides the single <main> landmark itself.
    await expect(page.locator("main")).toHaveCount(1);
  });
});
