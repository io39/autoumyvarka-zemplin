import { describe, it, expect } from "vitest";
import {
  buildCarHistories,
  poradieFor,
  type HistoryOrderInput,
} from "@/lib/clients/history";
import type { CarRow } from "@/lib/supabase/types";

function car(id: string): CarRow {
  return {
    id,
    spz: `SPZ${id}`,
    model: null,
    pricing_category: "os",
    created_at: "2026-01-01T00:00:00Z",
  } as CarRow;
}

function order(o: Partial<HistoryOrderInput> & { id: string; car_id: string }): HistoryOrderInput {
  return {
    starts_at: "2026-01-01T08:00:00Z",
    ends_at: "2026-01-01T09:00:00Z",
    status: "zaplatena",
    note: null,
    box: 1,
    deleted_at: null,
    services: [],
    workers: [],
    ...o,
  };
}

describe("buildCarHistories", () => {
  it("aggregates every order on a shared car, regardless of who booked it (PRD §13#1)", () => {
    // One car, 5 orders 'booked under A' + 1 'under B' — the loader passes all
    // 6 because it keys off car_id, not client_id. The helper must keep all 6.
    const shared = car("X");
    const orders: HistoryOrderInput[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        order({ id: `a${i}`, car_id: "X", starts_at: `2026-01-0${i + 1}T08:00:00Z` }),
      ),
      order({ id: "b0", car_id: "X", starts_at: "2026-01-09T08:00:00Z" }),
    ];

    const [history] = buildCarHistories([shared], orders, new Set(["X"]));
    expect(history.entries).toHaveLength(6);
    expect(history.shared).toBe(true);
  });

  it("excludes cancelled (deleted_at) orders but keeps no-shows", () => {
    const orders: HistoryOrderInput[] = [
      order({ id: "ok", car_id: "X" }),
      order({ id: "noshow", car_id: "X", status: "nedostavil_sa" }),
      order({ id: "cancelled", car_id: "X", deleted_at: "2026-02-01T00:00:00Z" }),
    ];

    const [history] = buildCarHistories([car("X")], orders, new Set());
    const ids = history.entries.map((e) => e.orderId);
    expect(ids).toContain("ok");
    expect(ids).toContain("noshow");
    expect(ids).not.toContain("cancelled");
  });

  it("orders entries newest-first by starts_at", () => {
    const orders: HistoryOrderInput[] = [
      order({ id: "old", car_id: "X", starts_at: "2026-01-01T08:00:00Z" }),
      order({ id: "new", car_id: "X", starts_at: "2026-03-01T08:00:00Z" }),
      order({ id: "mid", car_id: "X", starts_at: "2026-02-01T08:00:00Z" }),
    ];

    const [history] = buildCarHistories([car("X")], orders, new Set());
    expect(history.entries.map((e) => e.orderId)).toEqual(["new", "mid", "old"]);
  });

  it("carries snapshotted service names (removed marked), worker names, status, note", () => {
    const orders: HistoryOrderInput[] = [
      order({
        id: "o1",
        car_id: "X",
        status: "hotova",
        note: "Voľať pred príchodom",
        services: [
          { name_snapshot: "Interiér Classic", quantity: 1, price_cents_snapshot: 1500, removed_at: null },
          { name_snapshot: "Vosk", quantity: 2, price_cents_snapshot: 800, removed_at: "2026-01-02T00:00:00Z" },
        ],
        workers: [{ worker: { display_name: "Jano" } }, { worker: null }],
      }),
    ];

    const [history] = buildCarHistories([car("X")], orders, new Set());
    const [entry] = history.entries;
    expect(entry.status).toBe("hotova");
    expect(entry.note).toBe("Voľať pred príchodom");
    expect(entry.services).toEqual([
      { name: "Interiér Classic", quantity: 1, removed: false },
      { name: "Vosk", quantity: 2, removed: true },
    ]);
    // null worker embeds are dropped; only resolved names remain.
    expect(entry.workers).toEqual(["Jano"]);
  });

  it("carries box, ends_at and a total of only the non-removed lines", () => {
    const orders: HistoryOrderInput[] = [
      order({
        id: "o1",
        car_id: "X",
        box: 2,
        ends_at: "2026-01-01T10:30:00Z",
        services: [
          { name_snapshot: "Umytie", quantity: 1, price_cents_snapshot: 1200, removed_at: null },
          { name_snapshot: "Vosk", quantity: 1, price_cents_snapshot: 500, removed_at: null },
          // removed line: listed but NOT counted in the total
          { name_snapshot: "Tepovanie", quantity: 1, price_cents_snapshot: 9000, removed_at: "2026-01-02T00:00:00Z" },
        ],
      }),
    ];

    const [history] = buildCarHistories([car("X")], orders, new Set());
    const [entry] = history.entries;
    expect(entry.box).toBe(2);
    expect(entry.endsAt).toBe("2026-01-01T10:30:00Z");
    expect(entry.totalCents).toBe(1700); // 1200 + 500, removed 9000 excluded
  });

  it("groups by car and gives an empty list for a car with no orders", () => {
    const orders: HistoryOrderInput[] = [
      order({ id: "o1", car_id: "A" }),
      order({ id: "o2", car_id: "A" }),
    ];

    const histories = buildCarHistories([car("A"), car("B")], orders, new Set());
    expect(histories.find((h) => h.car.id === "A")!.entries).toHaveLength(2);
    expect(histories.find((h) => h.car.id === "B")!.entries).toHaveLength(0);
  });
});

describe("poradieFor", () => {
  it("numbers per car: oldest visit = 1, newest = N (entries are newest-first)", () => {
    const orders: HistoryOrderInput[] = [
      order({ id: "old", car_id: "X", starts_at: "2026-01-01T08:00:00Z" }),
      order({ id: "new", car_id: "X", starts_at: "2026-03-01T08:00:00Z" }),
      order({ id: "mid", car_id: "X", starts_at: "2026-02-01T08:00:00Z" }),
    ];
    const [history] = buildCarHistories([car("X")], orders, new Set());
    // entries are [new, mid, old]; poradie counts oldest=1 → newest=3.
    expect(history.entries.map((_, i) => poradieFor(history.entries, i))).toEqual([3, 2, 1]);
    expect(poradieFor(history.entries, 0)).toBe(3); // newest visit
    expect(poradieFor(history.entries, 2)).toBe(1); // first ever visit
  });

  it("a single visit is Poradie 1", () => {
    expect(poradieFor([{} as never], 0)).toBe(1);
  });
});
