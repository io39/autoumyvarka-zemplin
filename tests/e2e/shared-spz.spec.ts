import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  uniquePhone,
  uniqueSpz,
  createClientViaUI,
  addCarViaUI,
  serviceClient,
} from "./support";

test.describe("shared ŠPZ", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("an existing ŠPZ links to a second client instead of duplicating", async ({ page }) => {
    const db = serviceClient();
    const spz = uniqueSpz();
    const spaced = `${spz.slice(0, 2)} ${spz.slice(2)}`; // normalizes back to spz
    const phoneA = uniquePhone();
    const phoneB = uniquePhone();
    const e164 = (n: string) => "+421" + n.slice(1);

    // Client A + new car.
    await createClientViaUI(page, { phone: phoneA, name: "Owner A" });
    await addCarViaUI(page, spz);
    await expect(page.getByText(spz, { exact: true }).first()).toBeVisible();

    const { data: car } = await db.from("cars").select("id").eq("spz", spz).single();
    expect(car?.id).toBeTruthy();
    const { count: links1 } = await db
      .from("client_cars")
      .select("*", { count: "exact", head: true })
      .eq("car_id", car!.id);
    expect(links1).toBe(1);

    // Client B + the SAME plate (spaced/diff case) → link-confirm prompt.
    await createClientViaUI(page, { phone: phoneB, name: "Owner B" });
    await addCarViaUI(page, spaced);
    await expect(page.getByText("ŠPZ už existuje")).toBeVisible();
    await page.getByRole("button", { name: "Prepojiť" }).click();
    await expect(page.getByText(spz, { exact: true }).first()).toBeVisible();

    // Still one car row; now two links; an audit car.link entry exists.
    const { count: carCount } = await db
      .from("cars")
      .select("*", { count: "exact", head: true })
      .eq("spz", spz);
    expect(carCount).toBe(1);

    const { count: links2 } = await db
      .from("client_cars")
      .select("*", { count: "exact", head: true })
      .eq("car_id", car!.id);
    expect(links2).toBe(2);

    const { data: linkAudit } = await db
      .from("audit_log")
      .select("action")
      .eq("entity_id", car!.id)
      .eq("action", "car.link")
      .limit(1)
      .maybeSingle();
    expect(linkAudit?.action).toBe("car.link");

    // Searching the shared ŠPZ surfaces BOTH owners (spec 02 §4.6 last bullet).
    // Search the FULL plate, not a 4-char prefix: every test uses the shared "TT"
    // uniqueSpz() prefix, so a short prefix matches hundreds of accumulated rows
    // and the two target owners fall outside the trigram result cap (the
    // documented shared-DB search flake). The full ŠPZ is unique to this car yet
    // still exercises the ŠPZ trigram match, and surfaces exactly its two owners.
    await page.goto("/clients");
    await page.getByLabel("Hľadať klienta").fill(spz);
    await expect(page.getByText(e164(phoneA))).toBeVisible();
    await expect(page.getByText(e164(phoneB))).toBeVisible();
  });
});
