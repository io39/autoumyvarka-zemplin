import { describe, it, expect } from "vitest";
import { STATE_COLOR, STATE_LABEL } from "@/types";
import type { OrderStatus } from "@/lib/supabase/types";

const STATUSES: OrderStatus[] = ["vytvorena", "hotova", "zaplatena", "nedostavil_sa"];

describe("STATE_LABEL / STATE_COLOR (spec 13)", () => {
  it("each map has exactly the 4 OrderStatus keys", () => {
    expect(Object.keys(STATE_LABEL).sort()).toEqual([...STATUSES].sort());
    expect(Object.keys(STATE_COLOR).sort()).toEqual([...STATUSES].sort());
  });

  it("labels are the Slovak status names", () => {
    expect(STATE_LABEL).toEqual({
      vytvorena: "Vytvorená",
      hotova: "Hotová",
      zaplatena: "Zaplatená",
      nedostavil_sa: "Nedostavil sa",
    });
  });

  it("palette is remapped to red / orange / green / gray", () => {
    expect(STATE_COLOR.vytvorena.bg).toContain("red");
    expect(STATE_COLOR.vytvorena.border).toContain("red");
    expect(STATE_COLOR.hotova.bg).toContain("orange");
    expect(STATE_COLOR.zaplatena.bg).toContain("green");
    expect(STATE_COLOR.nedostavil_sa.bg).toContain("gray");
  });

  it("every color carries a dark: variant on bg/border/text (legible in dark mode)", () => {
    for (const s of STATUSES) {
      const c = STATE_COLOR[s];
      expect(c.bg).toContain("dark:");
      expect(c.border).toContain("dark:");
      expect(c.text).toContain("dark:");
    }
  });
});
