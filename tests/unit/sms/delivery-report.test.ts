import { describe, expect, it } from "vitest";
import {
  mapDeliveryStatus,
  parseDeliveryReports,
} from "@/lib/sms/delivery-report";

/**
 * BulkGate bulk delivery confirmations (spec 07 §2.5).
 * https://help.bulkgate.com/docs/en/http-api-bulk-delivery-confirmations-and-incoming-sms.html
 */
describe("mapDeliveryStatus", () => {
  it("maps 1 (delivered) to the delivered status", () => {
    expect(mapDeliveryStatus(1)).toBe("delivered");
  });

  it("maps 3 (unknown/unavailable recipient) to failed", () => {
    expect(mapDeliveryStatus(3)).toBe("failed");
  });

  it("ignores 2 (buffered on SMSC) — the message may still be delivered", () => {
    expect(mapDeliveryStatus(2)).toBeNull();
  });

  it("ignores 10 (incoming SMS) — we do not handle replies", () => {
    expect(mapDeliveryStatus(10)).toBeNull();
  });

  it("ignores 13 (Viber seen)", () => {
    expect(mapDeliveryStatus(13)).toBeNull();
  });

  it("ignores an unrecognised status rather than guessing", () => {
    expect(mapDeliveryStatus(99)).toBeNull();
  });
});

describe("parseDeliveryReports", () => {
  it("reads an array of reports", () => {
    const reports = parseDeliveryReports([
      { status: "1", smsID: "tmpaaa", to: "421905123456", price: "0.03" },
      { status: "3", smsID: "tmpbbb", to: "421905999999" },
    ]);
    expect(reports).toEqual([
      { status: 1, smsID: "tmpaaa" },
      { status: 3, smsID: "tmpbbb" },
    ]);
  });

  it("accepts a numeric status as well as the string form", () => {
    expect(parseDeliveryReports([{ status: 1, smsID: "tmpaaa" }])).toEqual([
      { status: 1, smsID: "tmpaaa" },
    ]);
  });

  it("skips unusable entries instead of rejecting the whole batch", () => {
    // One bad entry must not cost us the delivery status of every other message
    // in the same POST — BulkGate would not resend the good ones.
    const reports = parseDeliveryReports([
      { status: "1", smsID: "tmpaaa" },
      { status: "1" },
      { smsID: "tmpccc" },
      "nonsense",
      { status: "1", smsID: "tmpddd" },
    ]);
    expect(reports).toEqual([
      { status: 1, smsID: "tmpaaa" },
      { status: 1, smsID: "tmpddd" },
    ]);
  });

  it("throws when the payload is not an array", () => {
    expect(() => parseDeliveryReports({ status: "1", smsID: "tmpaaa" })).toThrow();
  });
});
