import { describe, it, expect } from "vitest";
import { skPlural } from "@/lib/intl/sk";

const forms = { one: "objednávka", few: "objednávky", many: "objednávok" };

describe("skPlural", () => {
  it("uses the singular for 1, paucal for 2–4, genitive plural for 0 and 5+", () => {
    expect(skPlural(1, forms)).toBe("objednávka");
    expect(skPlural(2, forms)).toBe("objednávky");
    expect(skPlural(3, forms)).toBe("objednávky");
    expect(skPlural(4, forms)).toBe("objednávky");
    expect(skPlural(5, forms)).toBe("objednávok");
    expect(skPlural(0, forms)).toBe("objednávok");
    expect(skPlural(11, forms)).toBe("objednávok");
  });
});
