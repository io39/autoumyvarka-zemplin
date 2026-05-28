import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  seedOrder,
  serviceClient,
} from "./support";

test.describe("no-show + late-arrival revert (manager only)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("mark nedostavil_sa frees the slot; revert restores when slot free", async ({
    page,
  }) => {
    const db = serviceClient();
    const o = await seedOrder();
    await page.goto(`/orders/${o.orderId}`);

    await page
      .getByRole("button", { name: "Označiť ako nedostavil sa" })
      .click();
    // Assert on the persistent status badge, not the Sonner toast — the toast
    // races with `router.refresh()` and disappears in full-suite runs.
    await expect(
      page.getByText("Nedostavil sa", { exact: true }),
    ).toBeVisible();
    const { data: row } = await db
      .from("orders")
      .select("status")
      .eq("id", o.orderId)
      .single();
    expect(row!.status).toBe("nedostavil_sa");

    // Revert succeeds (slot still free).
    await page
      .getByRole("button", { name: "Označiť ako vytvorenú" })
      .click();
    await expect(page.getByText("Vytvorená", { exact: true })).toBeVisible();
    const { data: row2 } = await db
      .from("orders")
      .select("status")
      .eq("id", o.orderId)
      .single();
    expect(row2!.status).toBe("vytvorena");
  });

  test("revert rejected when slot was rebooked", async ({ page }) => {
    const db = serviceClient();
    const o = await seedOrder({ box: 1, time: "12:00" });

    // Mark no-show server-side.
    await db
      .from("orders")
      .update({ status: "nedostavil_sa" })
      .eq("id", o.orderId);

    // Insert a competing order at the same slot/box (allowed: the original
    // is excluded from the exclusion constraint as nedostavil_sa).
    const rebook = await seedOrder({
      box: 1,
      date: o.date,
      time: "12:00",
    });
    expect(rebook.orderId).not.toBe(o.orderId);

    // Sanity: both orders exist on the same (box, starts_at).
    const { data: orders } = await db
      .from("orders")
      .select("id, status, box, starts_at, ends_at, deleted_at")
      .in("id", [o.orderId, rebook.orderId]);
    expect(orders).toHaveLength(2);
    expect(o.startsAt).toBe(rebook.startsAt);

    // Try to revert — should be rejected.
    await page.goto(`/orders/${o.orderId}`);
    await page
      .getByRole("button", { name: "Označiť ako vytvorenú" })
      .click();
    await expect(page.getByText("Termín už bol medzitým obsadený.")).toBeVisible();

    const { data: row } = await db
      .from("orders")
      .select("status")
      .eq("id", o.orderId)
      .single();
    expect(row!.status).toBe("nedostavil_sa");
  });
});
