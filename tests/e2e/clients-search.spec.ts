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
    await expect(page.getByText(spz, { exact: true }).first()).toBeVisible();

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

    // ŠPZ match → the client surfaces (rows show meno + telefón only now, spec 17).
    await search.fill(spz.slice(0, 4));
    await expect(page.getByText(expectedE164)).toBeVisible();

    // Non-matching query → empty state.
    await search.fill("qzxqzx");
    await expect(page.getByText("Žiadny výsledok")).toBeVisible();

    // <2 chars → fall back to the alphabetical browse list (no fuzzy search).
    await search.fill("a");
    await expect(page.locator("[data-client-results]")).toBeVisible();
  });

  test("browse: lists clients alphabetically with pagination", async ({ page }) => {
    // A unique tag so the later fuzzy search matches *only* these 6 clients
    // (the e2e DB accumulates rows across tests). LETTERS ONLY — name search is
    // trigram-fuzzy, and a Date.now() tag shares its high-order base36 digits with
    // every other suite's timestamp-named clients ("Zmaz Test <ts>", "Wizard <ts>"
    // …), so a numeric tag fuzzy-matches them and breaks the exact-count assertion.
    const rand = (n: number) =>
      Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
    const tag = "Zzb" + rand(8);
    // Seed enough clients to span more than one page (page size = 5).
    for (let i = 0; i < 6; i++) {
      await createClientViaUI(page, { phone: uniquePhone(), name: `${tag} ${i}` });
    }

    await page.goto("/clients");
    // On load (empty query) the browse list and pagination are shown.
    await expect(page.locator("[data-client-results]")).toBeVisible();
    const pager = page.locator("[data-client-pagination]");
    await expect(pager).toBeVisible();

    // First page: prev disabled, a page-1 indicator, ≤5 rows.
    await expect(pager.getByLabel("Predošlá strana")).toBeDisabled();
    await expect(pager.getByText(/^Strana 1 z/)).toBeVisible();
    await expect(page.locator("[data-client-results] > li")).toHaveCount(5);

    // Next advances the page.
    await pager.getByLabel("Nasledujúca strana").click();
    await expect(pager.getByText(/^Strana 2 z/)).toBeVisible();
    await expect(pager.getByLabel("Predošlá strana")).toBeEnabled();

    // Search results are paginated by 5 too (so the panel never stretches).
    await page.getByLabel("Hľadať klienta").fill(tag);
    await expect(page.locator("[data-client-results] > li")).toHaveCount(5);
    const searchPager = page.locator("[data-client-pagination]");
    await expect(searchPager).toBeVisible();
    await expect(searchPager.getByText(/^Strana 1 z 2$/)).toBeVisible(); // 6 matches → 2 pages
    await searchPager.getByLabel("Nasledujúca strana").click();
    await expect(page.locator("[data-client-results] > li")).toHaveCount(1);
  });
});
