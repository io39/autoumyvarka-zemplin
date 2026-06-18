import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, WORKER_EMAIL, serviceClient, fillOverrideDate } from "./support";

test.describe("manager — /settings/hours", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("can open /settings/hours and see the 7 weekday rows", async ({ page }) => {
    await page.goto("/settings/hours");
    await expect(page.getByRole("heading", { name: "Otváracie hodiny" })).toBeVisible();
    for (const day of [
      "Pondelok",
      "Utorok",
      "Streda",
      "Štvrtok",
      "Piatok",
      "Sobota",
      "Nedeľa",
    ]) {
      await expect(page.getByText(day)).toBeVisible();
    }
  });

  test("save persists a closed Monday + custom Saturday hours", async ({ page }) => {
    await page.goto("/settings/hours");
    // Close Monday.
    const monday = page.locator('[data-day="0"]');
    const mondayClosed = monday.getByRole("checkbox");
    if (!(await mondayClosed.isChecked())) await mondayClosed.check();

    // Set Saturday 09:00–13:00.
    const saturday = page.locator('[data-day="5"]');
    const satClosed = saturday.getByRole("checkbox");
    if (await satClosed.isChecked()) await satClosed.uncheck();
    await saturday.getByLabel("Otvorenie").fill("09:00");
    await saturday.getByLabel("Zatvorenie").fill("13:00");

    // Exact match: the merged page also has an "Uložiť výnimku" button (overrides).
    await page.getByRole("button", { name: "Uložiť", exact: true }).click();

    // Closing Monday can orphan upcoming orders that OTHER suites seeded on
    // far-future Mondays (shared DB). The out-of-hours warn-but-allow feature
    // then holds the save behind a confirm dialog ("Napriek tomu uložiť") instead
    // of saving outright — this is the real manager flow. Confirm it if it shows;
    // in isolation (no orphaned orders) the toast appears directly. Wait on
    // whichever surfaces first rather than a fixed delay.
    const confirmOutside = page.getByRole("button", { name: "Napriek tomu uložiť" });
    const savedToast = page.getByText("Otváracie hodiny uložené.");
    await expect(confirmOutside.or(savedToast)).toBeVisible();
    if (await confirmOutside.isVisible()) await confirmOutside.click();
    await expect(savedToast).toBeVisible();

    // Verify in DB.
    const db = serviceClient();
    const { data: rows } = await db
      .from("opening_hours")
      .select("day_of_week, is_closed, open_time, close_time")
      .order("day_of_week");
    expect(rows?.find((r) => r.day_of_week === 0)?.is_closed).toBe(true);
    expect(rows?.find((r) => r.day_of_week === 5)).toMatchObject({
      is_closed: false,
      open_time: "09:00:00",
      close_time: "13:00:00",
    });
  });
});

test.describe("manager — /settings/exceptions", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("can add, edit, then remove a closed-day override", async ({ page }) => {
    const day = `2099-01-${String((Date.now() % 27) + 1).padStart(2, "0")}`;

    await page.goto("/settings/exceptions");
    await fillOverrideDate(page, day);
    await page.getByLabel("Popis (voliteľný)").fill("E2E sviatok");
    // "Zatvorené celý deň" defaults to checked.
    await page.getByRole("button", { name: "Uložiť výnimku" }).click();
    await expect(page.getByText("Výnimka uložená.")).toBeVisible();

    // The override appears in the list.
    const card = page.locator(`[data-override="${day}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByText("Zatvorené")).toBeVisible();

    // Re-saving the same date edits the same row (idempotent upsert).
    await card.getByRole("button", { name: "Upraviť" }).click();
    await page.getByRole("checkbox", { name: "Zatvorené celý deň" }).uncheck();
    // Scope to the override form — the merged page's hours editor also has
    // per-day "Otvorenie"/"Zatvorenie" inputs.
    const overrideForm = page.locator('[data-form="override"]');
    await overrideForm.getByLabel("Otvorenie").fill("08:00");
    await overrideForm.getByLabel("Zatvorenie").fill("12:00");
    await page.getByRole("button", { name: "Uložiť výnimku" }).click();
    await expect(page.getByText("Výnimka uložená.")).toBeVisible();
    await expect(page.locator(`[data-override="${day}"]`).getByText("08:00–12:00")).toBeVisible();

    // No duplicate row in the DB.
    const db = serviceClient();
    const { data: rows } = await db.from("day_overrides").select("*").eq("day", day);
    expect(rows).toHaveLength(1);

    // Remove it.
    await page.locator(`[data-override="${day}"]`).getByRole("button", { name: "Odstrániť" }).click();
    await expect(page.getByText("Výnimka odstránená.")).toBeVisible();
    await expect(page.locator(`[data-override="${day}"]`)).toHaveCount(0);
  });
});

test.describe("worker (prevadzka)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("gets the 403 view on /settings/hours and /settings/exceptions", async ({ page }) => {
    await page.goto("/settings/hours");
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();

    await page.goto("/settings/exceptions");
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
  });
});
