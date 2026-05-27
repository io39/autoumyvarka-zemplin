import { describe, expect, it } from "vitest";
import { requireManager, requireRole } from "@/lib/auth/require";
import { ForbiddenError } from "@/lib/auth/errors";
import type { CurrentStaff } from "@/lib/auth/session";

const manager: CurrentStaff = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "boss@x.sk",
  role: "manazer",
  display_name: "Boss",
};

const worker: CurrentStaff = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "worker@x.sk",
  role: "prevadzka",
  display_name: "Worker",
};

describe("requireManager", () => {
  it("returns the actor when they are a manager", () => {
    expect(requireManager(manager)).toBe(manager);
  });

  it("throws ForbiddenError for a worker", () => {
    expect(() => requireManager(worker)).toThrow(ForbiddenError);
  });
});

describe("requireRole", () => {
  it("passes for a matching role", () => {
    expect(requireRole(worker, "prevadzka")).toBe(worker);
  });

  it("throws for a non-matching role", () => {
    expect(() => requireRole(manager, "prevadzka")).toThrow(ForbiddenError);
  });
});
