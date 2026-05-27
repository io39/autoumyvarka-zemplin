import { test, expect } from "@playwright/test";
import {
  accessHeaders,
  MANAGER_EMAIL,
  uniquePhone,
  uniqueSpz,
  createClientViaUI,
  addCarViaUI,
} from "./support";

test.describe("unified fuzzy search", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("matches by name (diacritic + typo), phone, and ŠPZ", async ({ page }) => {
    const phone = uniquePhone(); // e.g. 09XXXXXXXX
    const spz = uniqueSpz();
    const expectedE164 = "+421" + phone.slice(1); // how it is stored

    await createClientViaUI(page, { phone, name: "Ján Novák" });
    await addCarViaUI(page, spz);
    await expect(page.getByText(spz, { exact: true })).toBeVisible();

    const search = page.getByLabel("Hľadať klienta");

    // Diacritic-insensitive name match.
    await page.goto("/clients");
    await search.fill("novak");
    await expect(page.getByText(expectedE164)).toBeVisible();

    // Fuzzy (missing letter) still matches.
    await search.fill("novk");
    await expect(page.getByText(expectedE164)).toBeVisible();

    // Phone fragment match (digits inside the stored number).
    await search.fill(phone.slice(2, 8));
    await expect(page.getByText(expectedE164)).toBeVisible();

    // ŠPZ match → the plate badge shows in the suggestion.
    await search.fill(spz.slice(0, 4));
    await expect(page.getByText(spz, { exact: true })).toBeVisible();

    // Non-matching query → empty state.
    await search.fill("qzxqzx");
    await expect(page.getByText("Žiadny výsledok")).toBeVisible();

    // <2 chars → prompt, no search.
    await search.fill("a");
    await expect(page.getByText("Zadajte aspoň 2 znaky.")).toBeVisible();
  });
});
