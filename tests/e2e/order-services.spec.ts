import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  seedOrder,
  serviceClient,
} from "./support";

test.describe("order services on existing order (manager)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("add a service to a zaplatena order; pay it; original lines stay paid", async ({
    page,
  }) => {
    const db = serviceClient();
    // Pin into the safe 11:00–12:45 window so adding another 60-min service
    // still fits within the seeded 17:00 close and doesn't overlap fixtures
    // from other suites.
    const o = await seedOrder({ status: "zaplatena", time: "11:00" });
    // Mark the original line paid (a paid order would normally have all
    // lines paid before transition).
    await db
      .from("order_services")
      .update({ paid: true })
      .eq("id", o.serviceLineId);

    await page.goto(`/orders/${o.orderId}`);

    // Pick a deterministic second service that is always seeded active
    // and priced for 'os'. Avoids flake when other tests deactivate
    // catalog entries earlier in the run.
    const { data: candidate } = await db
      .from("services")
      .select("id, name")
      .eq("name", "Exteriér Classic")
      .single();
    expect(candidate).not.toBeNull();
    // Re-activate if a prior test left it inactive.
    await db.from("services").update({ active: true }).eq("id", candidate!.id);

    // Add it via the UI.
    await page.locator("#add-service").click();
    await page.getByRole("option", { name: candidate!.name }).click();
    await page
      .getByRole("button", { name: "Pridať službu" })
      .click();
    await expect(page.getByText("Služba pridaná.")).toBeVisible();

    // The new line exists and is unpaid; original stays paid.
    const { data: lines } = await db
      .from("order_services")
      .select("id, service_id, paid, removed_at")
      .eq("order_id", o.orderId)
      .order("added_at");
    expect(lines!.length).toBe(2);
    expect(lines![0].paid).toBe(true);
    expect(lines![1].paid).toBe(false);

    // Pay the new line via the UI.
    await page
      .locator(`[data-service-line-id="${lines![1].id}"]`)
      .locator('input[type="checkbox"]')
      .click();
    await expect(page.getByText("Platba zmenená.")).toBeVisible();
    const { data: after } = await db
      .from("order_services")
      .select("paid")
      .eq("id", lines![1].id)
      .single();
    expect(after!.paid).toBe(true);
  });

  test("remove service line allowed only while vytvorena", async ({ page }) => {
    const db = serviceClient();

    // Vytvorena: removal allowed.
    const fresh = await seedOrder();
    await page.goto(`/orders/${fresh.orderId}`);
    await page
      .locator(`[data-service-line-id="${fresh.serviceLineId}"]`)
      .getByRole("button", { name: "Odstrániť" })
      .click();
    await expect(page.getByText("Služba odstránená.")).toBeVisible();
    const { data: removed } = await db
      .from("order_services")
      .select("removed_at")
      .eq("id", fresh.serviceLineId)
      .single();
    expect(removed!.removed_at).not.toBeNull();

    // Hotova: the "Odstrániť" button must be disabled (server also rejects).
    const performed = await seedOrder({ status: "hotova" });
    await page.goto(`/orders/${performed.orderId}`);
    await expect(
      page
        .locator(`[data-service-line-id="${performed.serviceLineId}"]`)
        .getByRole("button", { name: "Odstrániť" }),
    ).toBeDisabled();
    const { data: still } = await db
      .from("order_services")
      .select("removed_at")
      .eq("id", performed.serviceLineId)
      .single();
    expect(still!.removed_at).toBeNull();
  });

  test("marking an order Zaplatená ticks all its service lines paid", async ({ page }) => {
    const db = serviceClient();
    const o = await seedOrder({ status: "hotova", time: "11:00" });

    // The seeded line starts unpaid.
    const { data: before } = await db
      .from("order_services")
      .select("paid")
      .eq("id", o.serviceLineId)
      .single();
    expect(before!.paid).toBe(false);

    await page.goto(`/orders/${o.orderId}`);
    await page.getByRole("button", { name: "Označiť ako zaplatenú" }).click();
    await expect(page.getByText("Stav: Zaplatená.")).toBeVisible();

    // The cascade settled the line.
    const { data: after } = await db
      .from("order_services")
      .select("paid")
      .eq("id", o.serviceLineId)
      .single();
    expect(after!.paid).toBe(true);
  });

  test("adding a service that would overlap the next booking warns, then allows on confirm", async ({
    page,
  }) => {
    const db = serviceClient();
    // Order A at 11:00 box 1 (60 min → ends 12:00), with B booked right after it
    // in the same box, so A cannot extend in place.
    const a = await seedOrder({ box: 1, time: "11:00" });
    const endHHMM = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Bratislava",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(a.endsAt));
    await seedOrder({ box: 1, date: a.date, time: endHHMM });

    await page.goto(`/orders/${a.orderId}`);

    // A service (other than the seeded one) with a positive 'os' duration, so the
    // extension definitely overflows into B and must be refused.
    const { data: priced } = await db
      .from("service_prices")
      .select("service_id, duration_min")
      .eq("pricing_category", "os")
      .gt("duration_min", 0)
      .neq("service_id", a.serviceId);
    const ids = [...new Set((priced ?? []).map((p) => p.service_id))];
    const { data: actives } = await db
      .from("services")
      .select("id, name")
      .in("id", ids)
      .eq("active", true)
      .order("name");
    const candidate = actives![0];
    expect(candidate).toBeTruthy();

    await page.locator("#add-service").click();
    await page.getByRole("option", { name: candidate!.name }).click();
    await page.getByRole("button", { name: "Pridať službu" }).click();

    // Warn-but-allow (migration 0016): a confirm dialog names the clash and the
    // line is NOT added yet.
    await expect(page.getByRole("heading", { name: "Termín sa prekrýva" })).toBeVisible();
    const before = await db
      .from("order_services")
      .select("id")
      .eq("order_id", a.orderId)
      .is("removed_at", null);
    expect(before.data!.length).toBe(1);

    // Confirm → the service is added despite the overlap.
    await page.locator("[data-overlap-confirm]").click();
    await expect(page.getByText("Služba pridaná.")).toBeVisible();
    const after = await db
      .from("order_services")
      .select("id")
      .eq("order_id", a.orderId)
      .is("removed_at", null);
    expect(after.data!.length).toBe(2);
  });
});
