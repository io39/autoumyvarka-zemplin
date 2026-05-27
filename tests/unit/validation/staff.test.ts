import { describe, expect, it } from "vitest";
import { createStaffSchema, updateStaffSchema, setStaffActiveSchema } from "@/lib/validation/staff";

describe("createStaffSchema", () => {
  it("accepts valid input and normalizes the email (trim + lowercase)", () => {
    const parsed = createStaffSchema.parse({
      email: "  Boss@Example.SK ",
      display_name: "  Boss  ",
      role: "manazer",
    });
    expect(parsed.email).toBe("boss@example.sk");
    expect(parsed.display_name).toBe("Boss");
    expect(parsed.role).toBe("manazer");
  });

  it("rejects an invalid email", () => {
    expect(() =>
      createStaffSchema.parse({ email: "not-an-email", display_name: "X", role: "prevadzka" }),
    ).toThrow();
  });

  it("rejects an empty display name", () => {
    expect(() =>
      createStaffSchema.parse({ email: "a@b.sk", display_name: "   ", role: "prevadzka" }),
    ).toThrow();
  });

  it("rejects an unknown role", () => {
    expect(() =>
      createStaffSchema.parse({ email: "a@b.sk", display_name: "X", role: "admin" }),
    ).toThrow();
  });
});

describe("updateStaffSchema", () => {
  it("requires a uuid id", () => {
    expect(() =>
      updateStaffSchema.parse({ id: "nope", display_name: "X", role: "manazer" }),
    ).toThrow();
  });
});

describe("setStaffActiveSchema", () => {
  it("requires a boolean active flag", () => {
    expect(() =>
      setStaffActiveSchema.parse({ id: "11111111-1111-1111-1111-111111111111", active: "yes" }),
    ).toThrow();
  });
});
