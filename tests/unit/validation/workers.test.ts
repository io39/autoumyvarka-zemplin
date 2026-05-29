import { describe, it, expect } from "vitest";
import {
  createWorkerSchema,
  updateWorkerSchema,
  setWorkerActiveSchema,
} from "@/lib/validation/workers";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("worker validation", () => {
  it("accepts and trims a display name", () => {
    expect(createWorkerSchema.parse({ display_name: "  Peter  " })).toEqual({
      display_name: "Peter",
    });
  });

  it("rejects an empty display name", () => {
    expect(() => createWorkerSchema.parse({ display_name: "   " })).toThrow();
  });

  it("update requires a uuid id", () => {
    expect(updateWorkerSchema.parse({ id: UUID, display_name: "Jano" })).toEqual({
      id: UUID,
      display_name: "Jano",
    });
    expect(() => updateWorkerSchema.parse({ id: "nope", display_name: "Jano" })).toThrow();
  });

  it("setActive requires uuid + boolean", () => {
    expect(setWorkerActiveSchema.parse({ id: UUID, active: false })).toEqual({
      id: UUID,
      active: false,
    });
    expect(() => setWorkerActiveSchema.parse({ id: UUID, active: "no" })).toThrow();
  });
});
