import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, uniqueEmail, serviceClient } from "./support";

test.describe("audit log", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("creating a worker writes a staff.create audit entry", async ({ page }) => {
    const email = uniqueEmail("audit");
    const name = `Audit ${Date.now()}`;

    await page.goto("/staff");
    await page.getByRole("button", { name: "Pridať" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Meno").fill(name);
    await page.getByRole("button", { name: "Uložiť" }).click();

    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();

    // The new staff row + its audit entry exist in the DB.
    const db = serviceClient();
    const { data: staffRow } = await db.from("staff").select("id").eq("email", email).single();
    expect(staffRow?.id).toBeTruthy();

    const { data: audit } = await db
      .from("audit_log")
      .select("action, actor_email, entity_type, entity_id")
      .eq("entity_id", staffRow!.id)
      .eq("action", "staff.create")
      .single();

    expect(audit).toMatchObject({
      action: "staff.create",
      actor_email: MANAGER_EMAIL,
      entity_type: "staff",
      entity_id: staffRow!.id,
    });

    // Deactivate via the UI and assert the audit entry records before/after
    // state (data-model §2.11), not just the new value.
    await row.getByRole("button", { name: "Deaktivovať" }).click();
    await expect(row.getByText("Neaktívny")).toBeVisible();

    const { data: deactivateAudit } = await db
      .from("audit_log")
      .select("action, details")
      .eq("entity_id", staffRow!.id)
      .eq("action", "staff.deactivate")
      .single();

    expect(deactivateAudit?.details).toMatchObject({
      from: { active: true },
      to: { active: false },
    });
  });
});
