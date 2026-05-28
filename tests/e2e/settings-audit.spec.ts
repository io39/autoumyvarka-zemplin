import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, serviceClient } from "./support";

test.describe("audit log — settings", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("saving hours writes settings.hours_update; override set/remove are audited", async ({ page }) => {
    const db = serviceClient();
    const before = Date.now();

    // 1. Trigger a hours save.
    await page.goto("/settings/hours");
    await page.getByRole("button", { name: "Uložiť" }).click();
    await expect(page.getByText("Otváracie hodiny uložené.")).toBeVisible();

    await expect.poll(async () => {
      const { data } = await db
        .from("audit_log")
        .select("id")
        .eq("action", "settings.hours_update")
        .gte("created_at", new Date(before).toISOString());
      return data?.length ?? 0;
    }).toBeGreaterThan(0);

    // 2. Add a custom-hours override and remove it.
    const day = `2099-02-${String((Date.now() % 27) + 1).padStart(2, "0")}`;

    await page.goto("/settings/exceptions");
    await page.getByLabel("Dátum").fill(day);
    await page.getByRole("checkbox", { name: "Zatvorené celý deň" }).uncheck();
    await page.getByLabel("Otvorenie").fill("09:00");
    await page.getByLabel("Zatvorenie").fill("12:00");
    await page.getByRole("button", { name: "Uložiť výnimku" }).click();
    await expect(page.getByText("Výnimka uložená.")).toBeVisible();

    await expect.poll(async () => {
      const { data } = await db
        .from("audit_log")
        .select("id, details")
        .eq("action", "settings.override_set");
      return (data ?? []).filter((r) => {
        const d = (r.details ?? {}) as { day?: string };
        return d.day === day;
      }).length;
    }).toBe(1);

    await page
      .locator(`[data-override="${day}"]`)
      .getByRole("button", { name: "Odstrániť" })
      .click();
    await expect(page.getByText("Výnimka odstránená.")).toBeVisible();

    await expect.poll(async () => {
      const { data } = await db
        .from("audit_log")
        .select("id, details")
        .eq("action", "settings.override_remove");
      return (data ?? []).filter((r) => {
        const d = (r.details ?? {}) as { day?: string };
        return d.day === day;
      }).length;
    }).toBe(1);
  });

  test("non-15-min time is rejected (no partial write)", async ({ page }) => {
    const db = serviceClient();
    const day = `2099-03-${String((Date.now() % 27) + 1).padStart(2, "0")}`;

    await page.goto("/settings/exceptions");
    await page.getByLabel("Dátum").fill(day);
    await page.getByRole("checkbox", { name: "Zatvorené celý deň" }).uncheck();
    // 08:07 isn't on the 15-min grid; the schema rejects.
    await page.getByLabel("Otvorenie").fill("08:07");
    await page.getByLabel("Zatvorenie").fill("12:00");
    await page.getByRole("button", { name: "Uložiť výnimku" }).click();

    // The Slovak error toast appears (toast.error renders the message).
    await expect(page.getByText(/štvrťhodine/i)).toBeVisible();

    // No row written.
    const { data } = await db.from("day_overrides").select("*").eq("day", day);
    expect(data ?? []).toHaveLength(0);
  });
});
