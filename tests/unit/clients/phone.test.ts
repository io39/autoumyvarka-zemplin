import { describe, expect, it } from "vitest";
import { normalizePhone, phoneDigits } from "@/lib/clients/phone";

describe("normalizePhone", () => {
  it("converges national, international, and 00-prefixed forms to one E.164 value", () => {
    const expected = "+421905123456";
    expect(normalizePhone("0905123456")).toBe(expected);
    expect(normalizePhone("+421905123456")).toBe(expected);
    expect(normalizePhone("00421 905 123 456")).toBe(expected);
    expect(normalizePhone("0905 123 456")).toBe(expected);
    expect(normalizePhone("905123456")).toBe(expected);
    expect(normalizePhone("+421 (905) 123-456")).toBe(expected);
  });

  it("returns null for implausible input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("123")).toBeNull(); // too short
    expect(normalizePhone("+")).toBeNull();
  });
});

describe("phoneDigits", () => {
  it("strips the leading + for partial matching", () => {
    expect(phoneDigits("+421905123456")).toBe("421905123456");
  });
});
