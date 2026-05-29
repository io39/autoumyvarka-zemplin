import type { CarRow, OrderStatus } from "@/lib/supabase/types";

/**
 * Pure shaping of a client's per-car service history (spec 08).
 *
 * The *shared-car aggregation* (PRD §13#1 — a car's history shows every order
 * on that car regardless of which linked client booked it) is a property of the
 * query that loads `orders` by `car_id` with **no** `client_id` filter; it is
 * proven by the e2e suite. This helper owns the rest of the contract — and it
 * owns it honestly: the loader fetches orders **including** `deleted_at` rows so
 * the filtering below is the real gate (and is unit-testable), not dead code.
 *
 * - **Cancelled** orders (`deleted_at`) are excluded — a cancelled booking is
 *   not a performed service.
 * - **No-shows** (`nedostavil_sa`) are kept — PRD §10 wants them visible.
 *   (Default per spec §2.2; whether cancellations should also show is an open
 *   client question, non-blocking.)
 * - Removed service lines are kept and **marked** — history shows what
 *   happened, unlike the live order total which drops removed lines.
 * - Entries are newest-first by `starts_at`.
 */

export interface HistoryOrderService {
  name: string;
  quantity: number;
  removed: boolean;
}

export interface HistoryEntry {
  orderId: string;
  startsAt: string;
  status: OrderStatus;
  note: string | null;
  services: HistoryOrderService[];
  workers: string[];
}

export interface CarHistory {
  car: CarRow;
  /** Linked to more than one client → shows the "zdieľané auto" hint. */
  shared: boolean;
  entries: HistoryEntry[];
}

export interface HistoryOrderInput {
  id: string;
  car_id: string;
  starts_at: string;
  status: OrderStatus;
  note: string | null;
  deleted_at: string | null;
  services: Array<{
    name_snapshot: string;
    quantity: number;
    removed_at: string | null;
  }>;
  workers: Array<{ worker: { display_name: string } | null }>;
}

function toEntry(o: HistoryOrderInput): HistoryEntry {
  return {
    orderId: o.id,
    startsAt: o.starts_at,
    status: o.status,
    note: o.note,
    services: o.services.map((s) => ({
      name: s.name_snapshot,
      quantity: s.quantity,
      removed: s.removed_at !== null,
    })),
    workers: o.workers
      .map((w) => w.worker?.display_name)
      .filter((n): n is string => Boolean(n)),
  };
}

export function buildCarHistories(
  cars: CarRow[],
  orders: HistoryOrderInput[],
  sharedCarIds: ReadonlySet<string>,
): CarHistory[] {
  const byCar = new Map<string, HistoryEntry[]>();
  for (const o of orders) {
    if (o.deleted_at !== null) continue; // cancelled bookings excluded
    const list = byCar.get(o.car_id) ?? [];
    list.push(toEntry(o));
    byCar.set(o.car_id, list);
  }

  return cars.map((car) => {
    const entries = (byCar.get(car.id) ?? []).sort((a, b) =>
      b.startsAt.localeCompare(a.startsAt),
    );
    return { car, shared: sharedCarIds.has(car.id), entries };
  });
}
