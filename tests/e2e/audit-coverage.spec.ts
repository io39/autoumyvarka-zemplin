import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  nextWeekdayDate,
  serviceClient,
  uniquePhone,
  uniqueSpz,
} from "./support";

/**
 * Spec 09 §4.4 — after a full order lifecycle, /audit?orderId=… (which renders
 * the real getAuditLog) surfaces one entry for each audited event, with the
 * actor and a non-empty summary. Mutations are driven through the UI so the
 * audits are written by the actual actions; delete is performed LAST because
 * setNote/addOrderWorker/setStatus all guard on deleted_at.
 */
test.describe("audit coverage of order lifecycle (spec 09 §4.4)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("create → assign → note → status → delete each produce a visible audit entry", async ({
    page,
  }) => {
    const db = serviceClient();

    // Own our precondition: restore opening_hours to the seed defaults (other
    // suites mutate them and may not restore — app convention 0=Mon … 6=Sun).
    await db.from("opening_hours").upsert([
      { day_of_week: 0, open_time: "08:00", close_time: "17:00", is_closed: false },
      { day_of_week: 1, open_time: "08:00", close_time: "17:00", is_closed: false },
      { day_of_week: 2, open_time: "08:00", close_time: "17:00", is_closed: false },
      { day_of_week: 3, open_time: "08:00", close_time: "17:00", is_closed: false },
      { day_of_week: 4, open_time: "08:00", close_time: "17:00", is_closed: false },
      { day_of_week: 5, open_time: "08:00", close_time: "12:00", is_closed: false },
      { day_of_week: 6, open_time: null, close_time: null, is_closed: true },
    ]);

    const phone = `+421${uniquePhone().slice(1)}`;
    const { data: client } = await db
      .from("clients")
      .insert({ phone, name: "Audit klient" })
      .select("id")
      .single();
    const { data: car } = await db
      .from("cars")
      .insert({ spz: uniqueSpz("AU"), pricing_category: "os" })
      .select("id")
      .single();
    await db.from("client_cars").insert({ client_id: client!.id, car_id: car!.id });
    const { data: service } = await db
      .from("services")
      .select("id")
      .eq("active", true)
      .eq("name", "Interiér Classic")
      .single();

    const date = nextWeekdayDate();

    // 1) Create the order through the booking form → order.create.
    await page.goto(`/orders/new?clientId=${client!.id}&date=${date}`);
    await page.locator("#date").fill(date);
    await page.locator("#time").fill("14:00");
    await page.locator(`[data-service-id="${service!.id}"]`).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Vytvoriť" }).click();
    await page.waitForURL(/\/\?date=/);
    await expect(page.getByText("Objednávka vytvorená.")).toBeVisible();

    const { data: order } = await db
      .from("orders")
      .select("id")
      .eq("client_id", client!.id)
      .is("deleted_at", null)
      .single();
    const orderId = order!.id;
    await page.goto(`/orders/${orderId}`);

    // 2) Assign a worker → order.assign.
    await page.locator("#worker-select").click();
    await page.getByRole("option").first().click();
    await page
      .locator('[data-section="workers"]')
      .getByRole("button", { name: "Pridať", exact: true })
      .click();
    await expect(page.getByText("Zamestnanec pridaný.")).toBeVisible();

    // 3) Edit the note → order.note_edit.
    await page.locator('[data-section="note"]').getByRole("button", { name: "Pridať" }).click();
    await page.locator("textarea").fill("Audit poznámka.");
    await page.getByRole("button", { name: "Uložiť" }).click();
    await expect(page.getByText("Poznámka uložená.")).toBeVisible();

    // 4) Status change vytvorená → hotová → order.status_change.
    await page.getByRole("button", { name: "Označiť ako hotovú" }).click();
    await expect(page.getByText("Stav: Hotová.")).toBeVisible();

    // 5) Delete LAST → order.delete.
    await page.getByRole("button", { name: "Zrušiť objednávku" }).click();
    await page.getByRole("button", { name: "Zrušiť objednávku", exact: true }).last().click();
    await expect(page.getByText("Objednávka zrušená.")).toBeVisible();

    // The audit view filtered to this order shows every event with the actor.
    await page.goto(`/audit?orderId=${orderId}`);
    const audit = page.locator('[data-section="audit"]');
    for (const action of [
      "order.create",
      "order.assign",
      "order.note_edit",
      "order.status_change",
      "order.delete",
    ]) {
      await expect(audit.locator(`tr[data-action="${action}"]`)).toHaveCount(1);
    }
    // actor_email present and the status summary rendered non-empty.
    await expect(audit.getByText(MANAGER_EMAIL).first()).toBeVisible();
    await expect(audit.getByText("Vytvorená → Hotová")).toBeVisible();
  });
});
