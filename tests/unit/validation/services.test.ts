import { describe, expect, it } from "vitest";
import {
  createServiceSchema,
  upsertServicePriceSchema,
  setServiceActiveSchema,
} from "@/lib/validation/services";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("createServiceSchema", () => {
  it("accepts a main service with one per-category price row", () => {
    const parsed = createServiceSchema.parse({
      name: "  Interiér Classic  ",
      kind: "main",
      prices: [
        { pricingCategory: "os", durationMin: 60, priceCents: 1890 },
      ],
    });
    expect(parsed.name).toBe("Interiér Classic");
    expect(parsed.prices[0]).toMatchObject({
      pricingCategory: "os",
      durationMin: 60,
      priceCents: 1890,
      priceFrom: false,
    });
  });

  it("accepts a flat add-on (NULL category, NULL duration)", () => {
    const parsed = createServiceSchema.parse({
      name: "Dezinfekcia ozónom",
      kind: "addon",
      prices: [{ pricingCategory: null, durationMin: null, priceCents: 2000 }],
    });
    expect(parsed.prices[0]).toMatchObject({ pricingCategory: null, durationMin: null });
  });

  it("rejects a negative price", () => {
    expect(() =>
      createServiceSchema.parse({
        name: "X",
        kind: "addon",
        prices: [{ pricingCategory: null, durationMin: 30, priceCents: -1 }],
      }),
    ).toThrow();
  });

  it("rejects a non-positive duration", () => {
    expect(() =>
      createServiceSchema.parse({
        name: "X",
        kind: "addon",
        prices: [{ pricingCategory: null, durationMin: 0, priceCents: 100 }],
      }),
    ).toThrow();
  });

  it("rejects an empty prices array", () => {
    expect(() =>
      createServiceSchema.parse({ name: "X", kind: "main", prices: [] }),
    ).toThrow();
  });
});

describe("upsertServicePriceSchema", () => {
  it("requires a uuid serviceId", () => {
    expect(() =>
      upsertServicePriceSchema.parse({
        serviceId: "nope",
        pricingCategory: "os",
        durationMin: 60,
        priceCents: 1890,
      }),
    ).toThrow();
  });

  it("accepts NULL category + NULL duration (flat add-on)", () => {
    const parsed = upsertServicePriceSchema.parse({
      serviceId: UUID,
      pricingCategory: null,
      durationMin: null,
      priceCents: 1500,
    });
    expect(parsed.pricingCategory).toBe(null);
    expect(parsed.durationMin).toBe(null);
  });
});

describe("setServiceActiveSchema", () => {
  it("requires a boolean active flag", () => {
    expect(() => setServiceActiveSchema.parse({ id: UUID, active: "yes" })).toThrow();
  });
});
