import { describe, expect, it } from "vitest";
import { addCarToClientSchema, updateCarSchema } from "@/lib/validation/clients";

const CLIENT_ID = "11111111-1111-1111-1111-111111111111";
const CAR_ID = "22222222-2222-2222-2222-222222222222";

describe("addCarToClientSchema — optional ŠPZ", () => {
  it("normalizes a provided plate", () => {
    const r = addCarToClientSchema.safeParse({
      clientId: CLIENT_ID,
      spz: "bv 123 ab",
      pricingCategory: "os",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.spz).toBe("BV123AB");
  });

  it("accepts a plateless car when a brand is given (spz → NULL)", () => {
    const r = addCarToClientSchema.safeParse({
      clientId: CLIENT_ID,
      spz: "",
      brand: "Škoda",
      pricingCategory: "os",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.spz).toBeNull();
  });

  it("treats a whitespace-only plate as NULL (never an empty string)", () => {
    const r = addCarToClientSchema.safeParse({
      clientId: CLIENT_ID,
      spz: "   ",
      model: "Octavia",
      pricingCategory: "os",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.spz).toBeNull();
  });

  it("rejects a plateless car with no brand or model", () => {
    const r = addCarToClientSchema.safeParse({
      clientId: CLIENT_ID,
      spz: "  ",
      pricingCategory: "os",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an implausible non-blank plate even with a brand", () => {
    const r = addCarToClientSchema.safeParse({
      clientId: CLIENT_ID,
      spz: "@@",
      brand: "Škoda",
      pricingCategory: "os",
    });
    expect(r.success).toBe(false);
  });
});

describe("updateCarSchema — optional ŠPZ", () => {
  it("lets a manager add a plate to a plateless car", () => {
    const r = updateCarSchema.safeParse({
      id: CAR_ID,
      spz: "ba999xy",
      pricingCategory: "suv",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.spz).toBe("BA999XY");
  });

  it("keeps a car plateless if brand/model still identify it", () => {
    const r = updateCarSchema.safeParse({
      id: CAR_ID,
      spz: "",
      brand: "Audi",
      pricingCategory: "suv",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.spz).toBeNull();
  });

  it("rejects clearing the plate when nothing else identifies the car", () => {
    const r = updateCarSchema.safeParse({
      id: CAR_ID,
      spz: "",
      pricingCategory: "suv",
    });
    expect(r.success).toBe(false);
  });
});
