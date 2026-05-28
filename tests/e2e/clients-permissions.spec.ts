import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  WORKER_EMAIL,
  uniquePhone,
  uniqueSpz,
  createClientViaUI,
  addCarViaUI,
  serviceClient,
} from "./support";

const e164 = (national: string) => "+421" + national.slice(1);

test.describe("manager", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("can change a client's phone; audited, and lookup follows the new number", async ({
    page,
  }) => {
    const db = serviceClient();
    const oldPhone = uniquePhone();
    const newPhone = uniquePhone();

    const clientId = await createClientViaUI(page, { phone: oldPhone, name: "Phone Change" });

    await page.getByRole("button", { name: "Upraviť" }).click();
    await page.getByLabel("Telefón").fill(newPhone);
    await page.getByRole("button", { name: "Uložiť" }).click();
    await expect(page.getByText(e164(newPhone))).toBeVisible();

    // New phone resolves to the client; old phone no longer does.
    const { data: byNew } = await db
      .from("clients")
      .select("id")
      .eq("phone", e164(newPhone))
      .maybeSingle();
    expect(byNew?.id).toBe(clientId);
    const { data: byOld } = await db
      .from("clients")
      .select("id")
      .eq("phone", e164(oldPhone))
      .maybeSingle();
    expect(byOld).toBeNull();

    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("entity_id", clientId)
      .eq("action", "client.phone_change")
      .single();
    expect(audit?.details).toMatchObject({ from: e164(oldPhone), to: e164(newPhone) });
  });

  test("rejects changing a phone to one already used by another client", async ({ page }) => {
    const db = serviceClient();
    const takenPhone = uniquePhone();
    const otherPhone = uniquePhone();

    await createClientViaUI(page, { phone: takenPhone, name: "Owns Number" });
    const otherId = await createClientViaUI(page, { phone: otherPhone, name: "Wants Number" });

    await page.getByRole("button", { name: "Upraviť" }).click();
    await page.getByLabel("Telefón").fill(takenPhone);
    await page.getByRole("button", { name: "Uložiť" }).click();

    await expect(page.getByText("Klient s týmto telefónnym číslom už existuje.")).toBeVisible();

    // No partial update: the other client keeps its original number.
    const { data: stillOther } = await db
      .from("clients")
      .select("phone")
      .eq("id", otherId)
      .single();
    expect(stillOther?.phone).toBe(e164(otherPhone));
  });
});

test.describe("worker (prevadzka)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("can create a client and add a car, but sees no edit controls", async ({ page }) => {
    const spz = uniqueSpz();
    await createClientViaUI(page, { phone: uniquePhone(), name: "Worker Made" });
    await addCarViaUI(page, spz);
    await expect(page.getByText(spz, { exact: true }).first()).toBeVisible();

    // Manager-only edit affordances are absent for workers.
    await expect(page.getByRole("button", { name: "Upraviť" })).toHaveCount(0);
  });
});
