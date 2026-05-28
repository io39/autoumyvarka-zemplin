import { describe, expect, it } from "vitest";
import { reminderWindow, shouldRemind } from "@/lib/sms/reminder-window";

describe("reminderWindow (spec 07 §2.4)", () => {
  const now = new Date("2026-05-28T10:00:00Z");

  it("brackets 30 min ahead ± 2 min", () => {
    const { from, to } = reminderWindow(now, 2);
    expect(from.toISOString()).toBe("2026-05-28T10:28:00.000Z");
    expect(to.toISOString()).toBe("2026-05-28T10:32:00.000Z");
  });

  it("orders 30 min out are picked up", () => {
    expect(shouldRemind(now, new Date("2026-05-28T10:30:00Z"))).toBe(true);
  });

  it("orders 31 min out are picked up (inside window)", () => {
    expect(shouldRemind(now, new Date("2026-05-28T10:31:30Z"))).toBe(true);
  });

  it("orders 25 min out are NOT picked up (too soon)", () => {
    expect(shouldRemind(now, new Date("2026-05-28T10:25:00Z"))).toBe(false);
  });

  it("orders 60 min out are NOT picked up (too far)", () => {
    expect(shouldRemind(now, new Date("2026-05-28T11:00:00Z"))).toBe(false);
  });
});
