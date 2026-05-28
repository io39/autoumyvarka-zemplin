import { describe, expect, it } from "vitest";
import { allowedNextStatuses, canTransition } from "@/lib/orders/transitions";

describe("canTransition", () => {
  it("vytvorena → hotova allowed for both roles", () => {
    expect(canTransition("vytvorena", "hotova", "prevadzka")).toBe(true);
    expect(canTransition("vytvorena", "hotova", "manazer")).toBe(true);
  });

  it("hotova → zaplatena allowed for both roles (PRD §3 matrix)", () => {
    expect(canTransition("hotova", "zaplatena", "manazer")).toBe(true);
    expect(canTransition("hotova", "zaplatena", "prevadzka")).toBe(true);
  });

  it("vytvorena → nedostavil_sa manager-only", () => {
    expect(canTransition("vytvorena", "nedostavil_sa", "prevadzka")).toBe(false);
    expect(canTransition("vytvorena", "nedostavil_sa", "manazer")).toBe(true);
  });

  it("nedostavil_sa → vytvorena manager-only (late-arrival exception)", () => {
    expect(canTransition("nedostavil_sa", "vytvorena", "manazer")).toBe(true);
    expect(canTransition("nedostavil_sa", "vytvorena", "prevadzka")).toBe(false);
  });

  it("rejects every other return to vytvorena", () => {
    expect(canTransition("hotova", "vytvorena", "manazer")).toBe(false);
    expect(canTransition("zaplatena", "vytvorena", "manazer")).toBe(false);
  });

  it("zaplatena is terminal", () => {
    expect(canTransition("zaplatena", "hotova", "manazer")).toBe(false);
    expect(canTransition("zaplatena", "nedostavil_sa", "manazer")).toBe(false);
  });

  it("no self-transitions", () => {
    expect(canTransition("vytvorena", "vytvorena", "manazer")).toBe(false);
    expect(canTransition("hotova", "hotova", "manazer")).toBe(false);
  });
});

describe("allowedNextStatuses", () => {
  it("lists only edges allowed for the role", () => {
    expect(allowedNextStatuses("vytvorena", "manazer").sort()).toEqual(
      ["hotova", "nedostavil_sa"].sort(),
    );
    expect(allowedNextStatuses("vytvorena", "prevadzka")).toEqual(["hotova"]);
    expect(allowedNextStatuses("hotova", "manazer")).toEqual(["zaplatena"]);
    expect(allowedNextStatuses("hotova", "prevadzka")).toEqual(["zaplatena"]);
    expect(allowedNextStatuses("nedostavil_sa", "manazer")).toEqual(["vytvorena"]);
    expect(allowedNextStatuses("zaplatena", "manazer")).toEqual([]);
  });
});
