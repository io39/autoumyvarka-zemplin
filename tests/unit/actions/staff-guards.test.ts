import { describe, expect, it } from "vitest";
import { isSelfDeactivation } from "@/lib/actions/staff-guards";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("isSelfDeactivation (lockout guard)", () => {
  it("blocks deactivating your own account", () => {
    expect(isSelfDeactivation(A, A, false)).toBe(true);
  });

  it("allows deactivating someone else", () => {
    expect(isSelfDeactivation(A, B, false)).toBe(false);
  });

  it("allows (re)activating your own account", () => {
    expect(isSelfDeactivation(A, A, true)).toBe(false);
  });
});
