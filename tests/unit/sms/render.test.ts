import { describe, expect, it } from "vitest";
import {
  renderTemplate,
  smsOverLimit,
  smsSegmentCount,
} from "@/lib/sms/render";

const baseCtx = {
  // 2026-05-28 09:30 Europe/Bratislava (CEST, UTC+2) → 07:30Z.
  startsAt: new Date("2026-05-28T07:30:00Z"),
  spz: "KE123AB",
  clientName: "Ján",
};

describe("renderTemplate", () => {
  it("substitutes known tokens with the Bratislava-local time", () => {
    const out = renderTemplate(
      "Pripomíname termín o {cas}, auto {spz}.",
      baseCtx,
    );
    expect(out).toBe("Pripomíname termín o 09:30, auto KE123AB.");
  });

  it("substitutes nazov when present", () => {
    expect(renderTemplate("Dobrý deň {nazov}, {spz}.", baseCtx)).toBe(
      "Dobrý deň Ján, KE123AB.",
    );
  });

  it("leaves unknown tokens in place rather than dropping them silently", () => {
    expect(renderTemplate("Test {unknown} {spz}.", baseCtx)).toBe(
      "Test {unknown} KE123AB.",
    );
  });

  it("handles missing client name without producing 'undefined'", () => {
    expect(
      renderTemplate("Dobrý deň{nazov}.", { ...baseCtx, clientName: null }),
    ).toBe("Dobrý deň.");
  });
});

describe("smsSegmentCount / smsOverLimit (70-char diacritics, PRD §8)", () => {
  it("0 chars → 0 segments", () => {
    expect(smsSegmentCount("")).toBe(0);
  });

  it("exactly 70 chars → 1 segment, not over-limit", () => {
    const body = "a".repeat(70);
    expect(smsSegmentCount(body)).toBe(1);
    expect(smsOverLimit(body)).toBe(false);
  });

  it("71 chars → 2 segments, over-limit", () => {
    const body = "a".repeat(71);
    expect(smsSegmentCount(body)).toBe(2);
    expect(smsOverLimit(body)).toBe(true);
  });

  it("137 chars (70 + 67) → 2 segments", () => {
    expect(smsSegmentCount("a".repeat(137))).toBe(2);
  });

  it("138 chars → 3 segments", () => {
    expect(smsSegmentCount("a".repeat(138))).toBe(3);
  });
});
