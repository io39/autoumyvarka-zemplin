"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/server";
import type {
  CarRow,
  ClientRow,
  OrderRow,
  OrderServiceRow,
  ServicePriceRow,
} from "@/lib/supabase/types";
import { type ActionResult, toActionError } from "./result";
import {
  createOrderSchema,
  getCalendarSchema,
  suggestSlotsSchema,
} from "@/lib/validation/orders";
import { resolveOrderLines, totalDurationMin } from "@/lib/orders/duration";
import { isOn15MinBoundary, suggestFreeSlots, type SlotProposal } from "@/lib/orders/slots";
import { isRangeOpen } from "@/lib/settings/availability";
import {
  bratislavaDateKey,
} from "@/lib/settings/availability";
import { bratislavaLocalDayRange } from "@/lib/time/bratislava";

const CONFLICT_MESSAGE = "Termín v tomto boxe je obsadený.";
const CLOSED_MESSAGE = "Termín je mimo otváracích hodín.";
const NOT_FOUND_MESSAGE = "Záznam sa nenašiel.";
const NOT_15MIN_MESSAGE = "Termín musí byť na štvrťhodine.";

export interface CalendarBlock {
  order: OrderRow;
  client: Pick<ClientRow, "id" | "name" | "phone">;
  car: Pick<CarRow, "id" | "spz" | "model" | "pricing_category">;
  services: OrderServiceRow[];
}

/**
 * Read all visible orders for a date (day) or the week containing it.
 * Excludes soft-deleted rows.
 */
export async function getCalendar(input: unknown): Promise<CalendarBlock[]> {
  const { view, date, box } = getCalendarSchema.parse(input);
  await getCurrentStaff();
  const db = getServiceClient();

  const { start, end } = rangeForView(view, date);
  let q = db
    .from("orders")
    .select(
      "*, client:client_id(id,name,phone), car:car_id(id,spz,model,pricing_category), services:order_services(*)",
    )
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .is("deleted_at", null)
    .order("starts_at");
  if (box) q = q.eq("box", box);
  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r) => ({
    order: stripJoined(r),
    client: r.client as CalendarBlock["client"],
    car: r.car as CalendarBlock["car"],
    services: r.services as OrderServiceRow[],
  }));
}

/** 15-min slot suggestions for a date that fit `durationMin` (open + free). */
export async function suggestSlots(input: unknown): Promise<SlotProposal[]> {
  const { date, durationMin, box, limit } = suggestSlotsSchema.parse(input);
  await getCurrentStaff();
  const db = getServiceClient();

  const { start, end } = rangeForView("day", date);
  const [hoursRes, overridesRes, busyRes] = await Promise.all([
    db.from("opening_hours").select("*"),
    db.from("day_overrides").select("*").eq("day", date),
    db
      .from("orders")
      .select("box, starts_at, ends_at, status, deleted_at")
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .is("deleted_at", null)
      .neq("status", "nedostavil_sa"),
  ]);
  if (hoursRes.error) throw hoursRes.error;
  if (overridesRes.error) throw overridesRes.error;
  if (busyRes.error) throw busyRes.error;

  return suggestFreeSlots({
    date: new Date(`${date}T12:00:00Z`),
    durationMin,
    hours: hoursRes.data ?? [],
    overrides: overridesRes.data ?? [],
    busy: (busyRes.data ?? []).map((r) => ({
      box: r.box,
      startsAt: new Date(r.starts_at),
      endsAt: new Date(r.ends_at),
    })),
    boxes: box ? [box] : [1, 2],
    limit,
  });
}

export type CreateOrderResult = ActionResult<{ id: string }>;

export async function createOrder(input: unknown): Promise<CreateOrderResult> {
  try {
    const data = createOrderSchema.parse(input);
    const actor = await getCurrentStaff();
    const db = getServiceClient();

    const startsAt = new Date(data.startsAt);
    if (!isOn15MinBoundary(startsAt)) {
      return { ok: false, message: NOT_15MIN_MESSAGE };
    }

    // Look up car + its category (drives service pricing).
    const { data: car, error: carErr } = await db
      .from("cars")
      .select("id, pricing_category")
      .eq("id", data.carId)
      .maybeSingle();
    if (carErr) throw carErr;
    if (!car) return { ok: false, message: "Auto sa nenašlo." };

    // Verify the car is owned by this client (data-model §2.4).
    const { data: link, error: linkErr } = await db
      .from("client_cars")
      .select("client_id")
      .eq("client_id", data.clientId)
      .eq("car_id", data.carId)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) return { ok: false, message: "Auto nepatrí klientovi." };

    // Load active service rows + their prices.
    const serviceIds = data.services.map((s) => s.serviceId);
    const [{ data: services, error: svcErr }, { data: prices, error: priceErr }] =
      await Promise.all([
        db.from("services").select("id, name, active").in("id", serviceIds),
        db.from("service_prices").select("*").in("service_id", serviceIds),
      ]);
    if (svcErr) throw svcErr;
    if (priceErr) throw priceErr;

    const serviceById = new Map((services ?? []).map((s) => [s.id, s]));
    const inactive = serviceIds.filter((id) => !serviceById.get(id)?.active);
    if (inactive.length > 0) {
      return { ok: false, message: "Niektorá zo služieb je neaktívna." };
    }

    const pricesByService = new Map<string, ServicePriceRow[]>();
    for (const p of prices ?? []) {
      const arr = pricesByService.get(p.service_id) ?? [];
      arr.push(p);
      pricesByService.set(p.service_id, arr);
    }

    const { lines, unavailable } = resolveOrderLines(
      data.services,
      car.pricing_category,
      pricesByService,
    );
    if (unavailable.length > 0) {
      return { ok: false, message: "Niektorá služba nie je dostupná pre tento typ vozidla." };
    }

    // Spec §2.3 / PRD §3: workers may book at the computed duration but
    // cannot override it (order-data editing is manager-only). Gate before
    // we accept the override value.
    if (data.durationOverrideMin !== undefined) {
      requireManager(actor);
    }
    const durationMin = data.durationOverrideMin ?? totalDurationMin(lines);
    if (durationMin <= 0) {
      return { ok: false, message: "Trvanie objednávky musí byť kladné." };
    }
    const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000);

    // Open-hours check (uses spec 04 helper). Belt-and-suspenders before the
    // DB ever sees the insert; the trigger keeps ends_at canonical anyway.
    const [{ data: hours }, { data: overrides }] = await Promise.all([
      db.from("opening_hours").select("*"),
      db
        .from("day_overrides")
        .select("*")
        .eq("day", bratislavaDateKey(startsAt)),
    ]);
    if (!isRangeOpen(startsAt, endsAt, hours ?? [], overrides ?? [])) {
      return { ok: false, message: CLOSED_MESSAGE };
    }

    // Insert the order; the BEFORE trigger sets ends_at canonically.
    const { data: orderRow, error: orderErr } = await db
      .from("orders")
      .insert({
        client_id: data.clientId,
        car_id: data.carId,
        box: data.box,
        starts_at: startsAt.toISOString(),
        duration_min: durationMin,
        ends_at: endsAt.toISOString(),
        note: data.note ?? null,
        created_by: actor.id,
      })
      .select("id, starts_at, ends_at, box, duration_min")
      .single();

    if (orderErr) {
      // Exclusion constraint violation → friendly Slovak conflict message.
      if (isExclusionViolation(orderErr)) {
        return { ok: false, message: CONFLICT_MESSAGE };
      }
      throw orderErr;
    }

    // Snapshot the service rows (data-model §2.8). Catalog edits later will
    // not rewrite this history.
    const snapshots = lines.map((l) => {
      const svc = serviceById.get(l.serviceId)!;
      return {
        order_id: orderRow.id,
        service_id: l.serviceId,
        name_snapshot: svc.name,
        category_snapshot: car.pricing_category,
        quantity: l.quantity,
        duration_min_snapshot: l.durationMin > 0 ? l.durationMin : null,
        price_cents_snapshot: l.priceCents,
        added_by: actor.id,
      };
    });
    const { error: linesErr } = await db.from("order_services").insert(snapshots);
    if (linesErr) {
      // Best-effort cleanup of the parent on partial failure.
      await db.from("orders").delete().eq("id", orderRow.id);
      throw linesErr;
    }

    await writeAudit(actor, "order.create", "order", orderRow.id, {
      client_id: data.clientId,
      car_id: data.carId,
      box: data.box,
      starts_at: orderRow.starts_at,
      ends_at: orderRow.ends_at,
      duration_min: orderRow.duration_min,
      services: snapshots.map((s) => ({
        service_id: s.service_id,
        quantity: s.quantity,
        duration_min: s.duration_min_snapshot,
        price_cents: s.price_cents_snapshot,
      })),
    }, orderRow.id);

    revalidatePath("/");
    return { ok: true, id: orderRow.id };
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function isExclusionViolation(error: { code?: string; message?: string } | null): boolean {
  // SQLSTATE 23P01 = exclusion_violation.
  if (!error) return false;
  if (error.code === "23P01") return true;
  return /orders_no_box_overlap/.test(error.message ?? "");
}

interface JoinedOrderRow extends OrderRow {
  client?: unknown;
  car?: unknown;
  services?: unknown;
}

function stripJoined(r: JoinedOrderRow): OrderRow {
  const { client: _c, car: _ca, services: _s, ...order } = r;
  void _c; void _ca; void _s;
  return order;
}

/** UTC [start, end) for the day or week containing `dateKey` (Bratislava local). */
function rangeForView(view: "day" | "week", dateKey: string): { start: Date; end: Date } {
  if (view === "day") return bratislavaLocalDayRange(dateKey);

  // Week: anchor to the Monday of the week containing `dateKey`, then take
  // the 7-day range starting there.
  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12)); // midday avoids DST edge
  const offsetToMonday = (probe.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const monday = new Date(probe);
  monday.setUTCDate(monday.getUTCDate() - offsetToMonday);
  const mondayKey = `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
  const sundayPlusOne = new Date(monday);
  sundayPlusOne.setUTCDate(monday.getUTCDate() + 7);
  const endKey = `${sundayPlusOne.getUTCFullYear()}-${pad(sundayPlusOne.getUTCMonth() + 1)}-${pad(sundayPlusOne.getUTCDate())}`;
  return {
    start: bratislavaLocalDayRange(mondayKey).start,
    end: bratislavaLocalDayRange(endKey).start,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
