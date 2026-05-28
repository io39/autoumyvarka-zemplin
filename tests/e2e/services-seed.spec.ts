import { test, expect } from "@playwright/test";
import { serviceClient } from "./support";

/**
 * Seed integrity — surface regressions in supabase/seed.sql before the price
 * lookup goes live in the booking flow (spec 05).
 */
test.describe("service catalog seed", () => {
  test("includes the expected main services + add-ons from docs/services.md", async () => {
    const db = serviceClient();

    const { data: services } = await db.from("services").select("name, kind");
    const names = (services ?? []).map((s) => s.name);

    // Spot-check a handful of seeded entries from the docs.
    expect(names).toContain("Interiér Classic");
    expect(names).toContain("Exteriér Classic");
    expect(names).toContain("Tepovanie (Interiér Premium)");
    expect(names).toContain("Tepovanie sedadla");
    expect(names).toContain("Dezinfekcia ozónom");

    const mains = (services ?? []).filter((s) => s.kind === "main");
    const addons = (services ?? []).filter((s) => s.kind === "addon");
    expect(mains.length).toBeGreaterThanOrEqual(7);
    expect(addons.length).toBeGreaterThanOrEqual(15);
  });

  test("prices have non-negative cents and durations are null or positive", async () => {
    const db = serviceClient();
    const { data: bad } = await db
      .from("service_prices")
      .select("id")
      .or("price_cents.lt.0,duration_min.lte.0");
    expect(bad ?? []).toHaveLength(0);
  });

  test("Stavba row on Tepovanie is price_from=true (matches 'od 217,90 €')", async () => {
    const db = serviceClient();
    const { data: svc } = await db
      .from("services")
      .select("id")
      .eq("name", "Tepovanie (Interiér Premium)")
      .single();
    expect(svc?.id).toBeTruthy();
    const { data: row } = await db
      .from("service_prices")
      .select("price_cents, price_from")
      .eq("service_id", svc!.id)
      .eq("pricing_category", "stavba")
      .single();
    expect(row).toMatchObject({ price_cents: 21790, price_from: true });
  });
});
