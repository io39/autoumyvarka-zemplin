import { describe, expect, it } from "vitest";
import {
  renderTemplate,
  smsOverLimit,
  smsSegmentCount,
  smsCharCount,
  stripDiacritics,
  SMS_SINGLE_SEGMENT,
} from "@/lib/sms/render";

const baseCtx = {
  // 2026-05-28 09:30 Europe/Bratislava (CEST, UTC+2) → 07:30Z.
  startsAt: new Date("2026-05-28T07:30:00Z"),
  spz: "KE123AB",
  clientName: "Ján",
};

describe("renderTemplate (always bez diakritiky — GSM-7)", () => {
  it("substitutes known tokens and strips diacritics from the result", () => {
    const out = renderTemplate("Pripomíname termín o {cas}, auto {spz}.", baseCtx);
    expect(out).toBe("Pripominame termin o 09:30, auto KE123AB.");
  });

  it("strips diacritics from substituted token values (e.g. the client name)", () => {
    expect(renderTemplate("Dobrý deň {nazov}, {spz}.", baseCtx)).toBe(
      "Dobry den Jan, KE123AB.",
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
    ).toBe("Dobry den.");
  });
});

describe("stripDiacritics", () => {
  it("maps every Slovak accented letter to ASCII", () => {
    expect(stripDiacritics("áäčďéíĺľňóôŕšťúýž ÁČŠŽŤ")).toBe("aacdeillnoorstuyz ACSZT");
  });

  it("leaves plain GSM-7 text untouched", () => {
    expect(stripDiacritics("Auto KE123AB je hotove.")).toBe("Auto KE123AB je hotove.");
  });
});

describe("smsCharCount (GSM-7, diacritic-free)", () => {
  it("counts the stripped length, so diacritics don't inflate it", () => {
    // "Pripomíname" (11 visible chars) → "Pripominame" (11 GSM-7 chars).
    expect(smsCharCount("Pripomíname")).toBe(11);
  });

  it("counts GSM-7 extension chars (e.g. €) as two", () => {
    expect(smsCharCount("€")).toBe(2);
  });
});

describe("smsSegmentCount / smsOverLimit (160-char GSM-7)", () => {
  it("0 chars → 0 segments", () => {
    expect(smsSegmentCount("")).toBe(0);
  });

  it(`exactly ${SMS_SINGLE_SEGMENT} chars → 1 segment, not over-limit`, () => {
    const body = "a".repeat(SMS_SINGLE_SEGMENT);
    expect(smsSegmentCount(body)).toBe(1);
    expect(smsOverLimit(body)).toBe(false);
  });

  it(`${SMS_SINGLE_SEGMENT + 1} chars → 2 segments, over-limit`, () => {
    const body = "a".repeat(SMS_SINGLE_SEGMENT + 1);
    expect(smsSegmentCount(body)).toBe(2);
    expect(smsOverLimit(body)).toBe(true);
  });

  it("diacritics no longer blow the limit: 160 accented chars still fit one segment", () => {
    const body = "á".repeat(SMS_SINGLE_SEGMENT);
    expect(smsSegmentCount(body)).toBe(1);
    expect(smsOverLimit(body)).toBe(false);
  });

  it("306 chars (2 × 153) → 2 segments", () => {
    expect(smsSegmentCount("a".repeat(306))).toBe(2);
  });

  it("307 chars → 3 segments", () => {
    expect(smsSegmentCount("a".repeat(307))).toBe(3);
  });
});
