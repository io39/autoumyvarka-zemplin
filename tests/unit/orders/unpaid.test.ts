import { describe, it, expect } from "vitest";
import {
  isUnpaid,
  isOverdue,
  unpaidAmountCents,
  computeClientFlags,
  type UnpaidOrderInput,
} from "@/lib/orders/unpaid";

const TODAY = "2026-05-29";
const YESTERDAY = "2026-05-28T10:00:00+02:00";
const TODAY_TS = "2026-05-29T10:00:00+02:00";
const TOMORROW = "2026-05-30T10:00:00+02:00";

function order(p: Partial<UnpaidOrderInput>): UnpaidOrderInput {
  return {
    status: "hotova",
    deleted_at: null,
    starts_at: TODAY_TS,
    price_override_cents: null,
    services: [],
    ...p,
  };
}

const paidLine = { paid: true, removed_at: null, price_cents_snapshot: 1890 };
const unpaidLine = { paid: false, removed_at: null, price_cents_snapshot: 1890 };
const removedUnpaidLine = {
  paid: false,
  removed_at: "2026-05-01T00:00:00Z",
  price_cents_snapshot: 1890,
};

describe("computeClientFlags", () => {
  it("counts overdue-unpaid orders + amount and no-shows; ignores clean ones", () => {
    const flags = computeClientFlags(
      [
        order({ status: "hotova", starts_at: YESTERDAY, services: [unpaidLine] }), // overdue unpaid
        order({ status: "nedostavil_sa", starts_at: YESTERDAY }), // no-show
        order({ status: "nedostavil_sa", starts_at: TODAY_TS }), // no-show
        order({ status: "hotova", starts_at: TOMORROW, services: [unpaidLine] }), // future → not overdue
        order({ status: "zaplatena", starts_at: YESTERDAY, services: [paidLine] }), // settled
        order({ status: "hotova", starts_at: YESTERDAY, deleted_at: "x", services: [unpaidLine] }), // deleted
      ],
      TODAY,
    );
    expect(flags).toEqual({ overdueUnpaidCount: 1, unpaidAmountCents: 1890, noShowCount: 2 });
  });

  it("a clean client has no flags", () => {
    const flags = computeClientFlags(
      [order({ status: "zaplatena", starts_at: YESTERDAY, services: [paidLine] })],
      TODAY,
    );
    expect(flags).toEqual({ overdueUnpaidCount: 0, unpaidAmountCents: 0, noShowCount: 0 });
  });
});

describe("isUnpaid (spec 10 §4.2)", () => {
  it("hotova order is unpaid regardless of lines", () => {
    expect(isUnpaid(order({ status: "hotova", services: [paidLine] }))).toBe(true);
    expect(isUnpaid(order({ status: "hotova", services: [] }))).toBe(true);
  });

  it("zaplatena with all lines paid is NOT unpaid", () => {
    expect(isUnpaid(order({ status: "zaplatena", services: [paidLine, paidLine] }))).toBe(false);
  });

  it("zaplatena with a post-hoc unpaid line IS unpaid (PRD §9.3)", () => {
    expect(isUnpaid(order({ status: "zaplatena", services: [paidLine, unpaidLine] }))).toBe(true);
  });

  it("a removed unpaid line does not count", () => {
    expect(
      isUnpaid(order({ status: "zaplatena", services: [paidLine, removedUnpaidLine] })),
    ).toBe(false);
  });

  it("vytvorena, nedostavil_sa, and soft-deleted are never unpaid", () => {
    expect(isUnpaid(order({ status: "vytvorena", services: [unpaidLine] }))).toBe(false);
    expect(isUnpaid(order({ status: "nedostavil_sa", services: [unpaidLine] }))).toBe(false);
    expect(
      isUnpaid(order({ status: "hotova", deleted_at: "2026-05-01T00:00:00Z", services: [unpaidLine] })),
    ).toBe(false);
  });
});

describe("isOverdue (spec 10 §4.2)", () => {
  it("hotova from yesterday is unpaid AND overdue", () => {
    expect(isOverdue(order({ status: "hotova", starts_at: YESTERDAY }), TODAY)).toBe(true);
  });

  it("hotova from today is unpaid but NOT overdue", () => {
    expect(isOverdue(order({ status: "hotova", starts_at: TODAY_TS }), TODAY)).toBe(false);
  });

  it("a paid (not-unpaid) order is never overdue, even from the past", () => {
    expect(
      isOverdue(order({ status: "zaplatena", starts_at: YESTERDAY, services: [paidLine] }), TODAY),
    ).toBe(false);
  });
});

describe("unpaidAmountCents", () => {
  it("sums only non-removed unpaid lines (snapshot is already the line total)", () => {
    const o = order({
      status: "zaplatena",
      services: [paidLine, unpaidLine, unpaidLine, removedUnpaidLine],
    });
    expect(unpaidAmountCents(o)).toBe(3780); // two unpaid lines × 1890
  });

  it("a manager price override IS the amount owed, ignoring the line sum", () => {
    const o = order({
      status: "hotova",
      price_override_cents: 5000,
      services: [unpaidLine, unpaidLine], // would sum to 3780
    });
    expect(unpaidAmountCents(o)).toBe(5000);
  });

  it("an override of 0 (free wash) means nothing owed", () => {
    const o = order({ status: "hotova", price_override_cents: 0, services: [unpaidLine] });
    expect(unpaidAmountCents(o)).toBe(0);
  });
});
