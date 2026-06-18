import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, expandSidebar } from "./support";

/**
 * Regression: the browser Realtime client is a singleton shared across all
 * consumers (calendar + unpaid/out-of-hours badges + lists). Previously each
 * consumer — and each calendar view/date re-subscribe — did its own
 * createClient(), spinning up a fresh GoTrueClient under the same auth storage
 * key, which logged "Multiple GoTrueClient instances detected" and accumulated
 * unbounded. The home page mounts ≥2 consumers and a date change forces a
 * calendar re-subscribe, so if the singleton regressed this would warn.
 */
test.describe("Realtime client is a singleton (no GoTrueClient warning)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("home page + a calendar re-subscribe produce no duplicate-client warning", async ({
    page,
  }) => {
    const gotrueWarnings: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("Multiple GoTrueClient instances detected")) {
        gotrueWarnings.push(msg.text());
      }
    });
    // A duplicate channel name on the shared client throws "cannot add
    // postgres_changes callbacks after subscribe()" and crashes the page — guard it.
    page.on("pageerror", (e) => pageErrors.push(e.message));

    // Calendar (one consumer) + the manager unpaid badge in the sidebar (another)
    // both subscribe on the shared client.
    await page.goto("/");
    await expandSidebar(page);
    await expect(page.locator("aside")).toBeVisible();

    // Force a calendar re-subscribe (the resubscribeKey is view/date): pre-fix
    // this created an extra client each time.
    await page.getByRole("button", { name: "Nasledujúci deň" }).click();
    await page.getByRole("button", { name: "Nasledujúci deň" }).click();

    // Give Realtime a moment to connect/re-connect, then assert: no duplicate-client
    // warning, and no runtime crash from a colliding channel name.
    await page.waitForTimeout(1500);
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
    expect(gotrueWarnings, gotrueWarnings.join("\n")).toHaveLength(0);
  });
});
