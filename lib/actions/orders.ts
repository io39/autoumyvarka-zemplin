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
  OrderStaffRow,
  ServicePriceRow,
  StaffRow,
} from "@/lib/supabase/types";
import { type ActionResult, toActionError } from "./result";
import {
  addOrderServiceSchema,
  createOrderSchema,
  deleteOrderSchema,
  getCalendarSchema,
  getOrderSchema,
  moveOrderSchema,
  orderWorkerSchema,
  removeOrderServiceSchema,
  setNoteSchema,
  setOrderServicePaidSchema,
  setStatusSchema,
  suggestSlotsSchema,
} from "@/lib/validation/orders";
import { resolveOrderLines, totalDurationMin } from "@/lib/orders/duration";
import { isOn15MinBoundary, suggestFreeSlots, type SlotProposal } from "@/lib/orders/slots";
import { isRangeOpen } from "@/lib/settings/availability";
import {
  bratislavaDateKey,
} from "@/lib/settings/availability";
import { bratislavaLocalDayRange } from "@/lib/time/bratislava";
import { canTransition } from "@/lib/orders/transitions";
import { emitOrderReady } from "@/lib/orders/ready-event";
import { resolveServicePrice } from "@/lib/services/price-lookup";

const CONFLICT_MESSAGE = "Termín v tomto boxe je obsadený.";
const CLOSED_MESSAGE = "Termín je mimo otváracích hodín.";
const NOT_FOUND_MESSAGE = "Záznam sa nenašiel.";
const NOT_15MIN_MESSAGE = "Termín musí byť na štvrťhodine.";
const ILLEGAL_TRANSITION_MESSAGE = "Túto zmenu stavu nie je povolené vykonať.";
const DELETE_AFTER_PAID_MESSAGE = "Zaplatenú objednávku nie je možné zrušiť.";
const REVERT_RETAKEN_MESSAGE = "Termín už bol medzitým obsadený.";
const SERVICE_INACTIVE_MESSAGE = "Niektorá zo služieb je neaktívna.";
const SERVICE_UNAVAILABLE_MESSAGE = "Služba nie je dostupná pre tento typ vozidla.";
const SERVICE_LINE_PERFORMED_MESSAGE =
  "Vykonanú službu nie je možné odstrániť.";

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

// ---------------------------------------------------------------------------
// Spec 06 — order detail & lifecycle
// ---------------------------------------------------------------------------

export interface OrderDetail {
  order: OrderRow;
  client: ClientRow;
  car: CarRow;
  services: OrderServiceRow[];
  workers: Array<OrderStaffRow & { staff: Pick<StaffRow, "id" | "display_name" | "role" | "active"> }>;
}

/** Read one order with everything the detail page renders. Both roles. */
export async function getOrder(input: unknown): Promise<OrderDetail | null> {
  const { id } = getOrderSchema.parse(input);
  await getCurrentStaff();
  const db = getServiceClient();

  const { data, error } = await db
    .from("orders")
    .select(
      "*, client:client_id(*), car:car_id(*), services:order_services(*), workers:order_staff(*, staff:staff_id(id, display_name, role, active))",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

   
  const r = data as any;
  return {
    order: stripJoined(r),
    client: r.client,
    car: r.car,
    services: r.services ?? [],
    workers: r.workers ?? [],
  };
}

export async function setStatus(input: unknown): Promise<ActionResult> {
  try {
    const { id, next } = setStatusSchema.parse(input);
    const actor = await getCurrentStaff();
    const db = getServiceClient();

    const { data: before, error: beforeErr } = await db
      .from("orders")
      .select("id, status, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before || before.deleted_at) {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }
    if (before.status === next) {
      return { ok: false, message: ILLEGAL_TRANSITION_MESSAGE };
    }
    if (!canTransition(before.status, next, actor.role)) {
      return { ok: false, message: ILLEGAL_TRANSITION_MESSAGE };
    }

    // The exception edge: nedostavil_sa → vytvorena re-checks conflict and
    // hours, because the slot was freed and may have been rebooked.
    if (before.status === "nedostavil_sa" && next === "vytvorena") {
      const { data: full, error: fullErr } = await db
        .from("orders")
        .select("box, starts_at, ends_at")
        .eq("id", id)
        .single();
      if (fullErr) throw fullErr;
      if (!(await slotIsFree(db, id, full.box, new Date(full.starts_at), new Date(full.ends_at)))) {
        return { ok: false, message: REVERT_RETAKEN_MESSAGE };
      }
      if (!(await rangeIsOpen(db, new Date(full.starts_at), new Date(full.ends_at)))) {
        return { ok: false, message: CLOSED_MESSAGE };
      }
    }

    const { error: updErr } = await db
      .from("orders")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updErr) {
      if (isExclusionViolation(updErr)) {
        return { ok: false, message: REVERT_RETAKEN_MESSAGE };
      }
      throw updErr;
    }

    await writeAudit(
      actor,
      "order.status_change",
      "order",
      id,
      { from: before.status, to: next },
      id,
    );

    if (before.status === "vytvorena" && next === "hotova") {
      await emitOrderReady({
        orderId: id,
        actorEmail: actor.email,
        emittedAt: new Date(),
      });
    }

    revalidatePath("/");
    revalidatePath(`/orders/${id}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function moveOrder(input: unknown): Promise<ActionResult> {
  try {
    const { id, box, startsAt } = moveOrderSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const newStart = new Date(startsAt);
    if (!isOn15MinBoundary(newStart)) {
      return { ok: false, message: NOT_15MIN_MESSAGE };
    }

    const { data: before, error: beforeErr } = await db
      .from("orders")
      .select("box, starts_at, ends_at, duration_min, status, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before || before.deleted_at) {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }

    const newEnd = new Date(newStart.getTime() + before.duration_min * 60_000);
    if (!(await rangeIsOpen(db, newStart, newEnd))) {
      return { ok: false, message: CLOSED_MESSAGE };
    }

    const { error: updErr } = await db
      .from("orders")
      .update({
        box,
        starts_at: newStart.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updErr) {
      if (isExclusionViolation(updErr)) {
        return { ok: false, message: CONFLICT_MESSAGE };
      }
      throw updErr;
    }

    await writeAudit(
      actor,
      "order.move",
      "order",
      id,
      {
        from: { box: before.box, starts_at: before.starts_at },
        to: { box, starts_at: newStart.toISOString() },
      },
      id,
    );

    revalidatePath("/");
    revalidatePath(`/orders/${id}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteOrder(input: unknown): Promise<ActionResult> {
  try {
    const { id } = deleteOrderSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeErr } = await db
      .from("orders")
      .select("status, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before || before.deleted_at) {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }
    if (before.status === "zaplatena") {
      return { ok: false, message: DELETE_AFTER_PAID_MESSAGE };
    }

    const { error: updErr } = await db
      .from("orders")
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updErr) throw updErr;

    await writeAudit(
      actor,
      "order.delete",
      "order",
      id,
      { previous_status: before.status },
      id,
    );

    revalidatePath("/");
    revalidatePath(`/orders/${id}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addOrderWorker(input: unknown): Promise<ActionResult> {
  try {
    const { id, staffId } = orderWorkerSchema.parse(input);
    const actor = await getCurrentStaff();
    const db = getServiceClient();

    // Ensure the assignee exists and is active (FK alone would allow inactive).
    const { data: assignee, error: aErr } = await db
      .from("staff")
      .select("id, active")
      .eq("id", staffId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!assignee || !assignee.active) {
      return { ok: false, message: "Zamestnanec nie je k dispozícii." };
    }

    const { data: order, error: oErr } = await db
      .from("orders")
      .select("id, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order || order.deleted_at) {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }

    // Idempotent: re-adding the same worker is a no-op (PK collision swallowed).
    const { error: insErr } = await db
      .from("order_staff")
      .insert({ order_id: id, staff_id: staffId, assigned_by: actor.id });
    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") {
        return { ok: true };
      }
      throw insErr;
    }

    await writeAudit(
      actor,
      "order.assign",
      "order",
      id,
      { staff_id: staffId },
      id,
    );

    revalidatePath(`/orders/${id}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeOrderWorker(input: unknown): Promise<ActionResult> {
  try {
    const { id, staffId } = orderWorkerSchema.parse(input);
    const actor = await getCurrentStaff();
    const db = getServiceClient();

    const { error: delErr, count } = await db
      .from("order_staff")
      .delete({ count: "exact" })
      .eq("order_id", id)
      .eq("staff_id", staffId);
    if (delErr) throw delErr;
    if (!count) {
      // Nothing to remove; treat as no-op (idempotent) without an audit row.
      return { ok: true };
    }

    await writeAudit(
      actor,
      "order.unassign",
      "order",
      id,
      { staff_id: staffId },
      id,
    );

    revalidatePath(`/orders/${id}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setNote(input: unknown): Promise<ActionResult> {
  try {
    const { id, note } = setNoteSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeErr } = await db
      .from("orders")
      .select("note, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before || before.deleted_at) {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }

    const trimmed = note?.trim() || null;
    const { error: updErr } = await db
      .from("orders")
      .update({ note: trimmed, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updErr) throw updErr;

    await writeAudit(
      actor,
      "order.note_edit",
      "order",
      id,
      { from: before.note?.trim() || null, to: trimmed },
      id,
    );

    revalidatePath(`/orders/${id}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addOrderService(input: unknown): Promise<ActionResult> {
  try {
    const data = addOrderServiceSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: order, error: oErr } = await db
      .from("orders")
      .select("id, car_id, duration_min, starts_at, box, deleted_at")
      .eq("id", data.id)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order || order.deleted_at) {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }

    // Active lines drive the "default" duration. If the order's stored
    // duration matches their sum, no manual override is in effect and we
    // recompute downstream; otherwise leave the override alone (spec §2.3).
    const baselineDuration = await sumActiveLineDuration(db, order.id);
    const hasOverride = order.duration_min !== baselineDuration;

    const { data: car, error: carErr } = await db
      .from("cars")
      .select("pricing_category")
      .eq("id", order.car_id)
      .single();
    if (carErr) throw carErr;

    const { data: svc, error: svcErr } = await db
      .from("services")
      .select("id, name, active")
      .eq("id", data.serviceId)
      .maybeSingle();
    if (svcErr) throw svcErr;
    if (!svc || !svc.active) {
      return { ok: false, message: SERVICE_INACTIVE_MESSAGE };
    }

    const { data: prices, error: pErr } = await db
      .from("service_prices")
      .select("*")
      .eq("service_id", data.serviceId);
    if (pErr) throw pErr;

    const resolved = resolveServicePrice(prices ?? [], car.pricing_category);
    if (!resolved.ok) {
      return { ok: false, message: SERVICE_UNAVAILABLE_MESSAGE };
    }
    const quantity = data.quantity ?? 1;
    const lineDuration = (resolved.durationMin ?? 0) * quantity;
    const linePrice = resolved.priceCents * quantity;

    // Respect a prior manual override: if one's in effect (stored
    // duration_min ≠ Σ active line durations), don't widen the booking when
    // the manager adds a service. Otherwise track Σ lines as the default.
    if (!hasOverride && lineDuration > 0) {
      const newDuration = order.duration_min + lineDuration;
      const start = new Date(order.starts_at);
      const newEnd = new Date(start.getTime() + newDuration * 60_000);
      if (!(await rangeIsOpen(db, start, newEnd))) {
        return { ok: false, message: CLOSED_MESSAGE };
      }
      const { error: durErr } = await db
        .from("orders")
        .update({ duration_min: newDuration, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (durErr) {
        if (isExclusionViolation(durErr)) {
          return { ok: false, message: CONFLICT_MESSAGE };
        }
        throw durErr;
      }
    }

    const { data: line, error: lineErr } = await db
      .from("order_services")
      .insert({
        order_id: order.id,
        service_id: svc.id,
        name_snapshot: svc.name,
        category_snapshot: car.pricing_category,
        quantity,
        duration_min_snapshot: resolved.durationMin != null ? resolved.durationMin * quantity : null,
        price_cents_snapshot: linePrice,
        added_by: actor.id,
      })
      .select("id")
      .single();
    if (lineErr) throw lineErr;

    await writeAudit(
      actor,
      "order_service.add",
      "order_service",
      line.id,
      {
        service_id: svc.id,
        quantity,
        duration_min: resolved.durationMin != null ? resolved.durationMin * quantity : null,
        price_cents: linePrice,
      },
      order.id,
    );

    revalidatePath("/");
    revalidatePath(`/orders/${order.id}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeOrderService(input: unknown): Promise<ActionResult> {
  try {
    const { orderServiceId } = removeOrderServiceSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: line, error: lineErr } = await db
      .from("order_services")
      .select(
        "id, order_id, duration_min_snapshot, removed_at, orders:order_id(duration_min, status)",
      )
      .eq("id", orderServiceId)
      .maybeSingle();
    if (lineErr) throw lineErr;
    if (!line || line.removed_at) {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }

    const parent = (line as any).orders as {
      duration_min: number;
      status: OrderRow["status"];
    } | undefined;
    if (parent && parent.status !== "vytvorena") {
      // "Performed" once the order is hotova or later (spec 06 §2.6).
      return { ok: false, message: SERVICE_LINE_PERFORMED_MESSAGE };
    }

    const { error: updErr } = await db
      .from("order_services")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", orderServiceId);
    if (updErr) throw updErr;

    // Mirror addOrderService: shrink duration_min only when no manual
    // override is in effect (parent.duration_min === Σ active line durations
    // BEFORE the removal). With override active, leave the slot alone.
    if (parent) {
      const baseline = await sumActiveLineDuration(db, line.order_id);
      const removedDuration = line.duration_min_snapshot ?? 0;
      // baseline already excludes the just-removed line; pre-removal baseline
      // was baseline + removedDuration. If that matched parent.duration_min,
      // there was no override.
      const preRemovalBaseline = baseline + removedDuration;
      if (preRemovalBaseline === parent.duration_min && removedDuration > 0) {
        const newDuration = Math.max(1, baseline);
        const { error: durErr } = await db
          .from("orders")
          .update({
            duration_min: newDuration,
            updated_at: new Date().toISOString(),
          })
          .eq("id", line.order_id);
        if (durErr) throw durErr;
      }
    }

    await writeAudit(
      actor,
      "order_service.remove",
      "order_service",
      orderServiceId,
      null,
      line.order_id,
    );

    revalidatePath(`/orders/${line.order_id}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setOrderServicePaid(input: unknown): Promise<ActionResult> {
  try {
    const { orderServiceId, paid } = setOrderServicePaidSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: line, error: lineErr } = await db
      .from("order_services")
      .select("id, order_id, paid, removed_at")
      .eq("id", orderServiceId)
      .maybeSingle();
    if (lineErr) throw lineErr;
    if (!line || line.removed_at) {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }
    if (line.paid === paid) return { ok: true };

    const { error: updErr } = await db
      .from("order_services")
      .update({ paid })
      .eq("id", orderServiceId);
    if (updErr) throw updErr;

    await writeAudit(
      actor,
      "order_service.paid",
      "order_service",
      orderServiceId,
      { from: line.paid, to: paid },
      line.order_id,
    );

    revalidatePath(`/orders/${line.order_id}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// internal helpers — re-used by spec 06 actions
// ---------------------------------------------------------------------------

async function rangeIsOpen(
   
  db: any,
  start: Date,
  end: Date,
): Promise<boolean> {
  const [{ data: hours }, { data: overrides }] = await Promise.all([
    db.from("opening_hours").select("*"),
    db.from("day_overrides").select("*").eq("day", bratislavaDateKey(start)),
  ]);
  return isRangeOpen(start, end, hours ?? [], overrides ?? []);
}

/** Σ duration_min_snapshot over active (non-removed) lines of an order. */
async function sumActiveLineDuration(

  db: any,
  orderId: string,
): Promise<number> {
  const { data, error } = await db
    .from("order_services")
    .select("duration_min_snapshot")
    .eq("order_id", orderId)
    .is("removed_at", null);
  if (error) throw error;
  return ((data ?? []) as { duration_min_snapshot: number | null }[]).reduce(
    (acc, r) => acc + (r.duration_min_snapshot ?? 0),
    0,
  );
}

/** True iff no other live order overlaps [start, end) in `box` (excluding `id`). */
async function slotIsFree(
   
  db: any,
  excludingOrderId: string,
  box: number,
  start: Date,
  end: Date,
): Promise<boolean> {
  const { data, error } = await db
    .from("orders")
    .select("id, starts_at, ends_at")
    .eq("box", box)
    .is("deleted_at", null)
    .neq("status", "nedostavil_sa")
    .neq("id", excludingOrderId)
    .lt("starts_at", end.toISOString())
    .gt("ends_at", start.toISOString());
  if (error) throw error;
  return (data ?? []).length === 0;
}
