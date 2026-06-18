"use server";

// Registers the ORDER_READY → "ready" SMS listener (spec 07). Imported here
// because `setStatus` (below) emits that event after a successful transition,
// and the listener must already be subscribed when emit fires.
import "@/lib/sms/wire";

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
  OrderStatus,
  ServicePriceRow,
  SmsMessageRow,
  WorkerRow,
} from "@/lib/supabase/types";
import { formatCarPrimary } from "@/lib/cars/format";
import { type ActionResult, toActionError } from "./result";
import { getOrderSms } from "./sms";
import {
  addOrderServiceSchema,
  changeOrderCarSchema,
  createOrderSchema,
  deleteOrderSchema,
  getCalendarSchema,
  getOrderSchema,
  moveOrderSchema,
  orderWorkerSchema,
  removeOrderServiceSchema,
  setNoteSchema,
  setOrderPriceSchema,
  setOrderServicePaidSchema,
  setStatusSchema,
  suggestSlotsSchema,
  getUnpaidOrdersSchema,
} from "@/lib/validation/orders";
import {
  isUnpaid,
  isOverdue,
  unpaidAmountCents,
  computeClientFlags,
  type ClientFlags,
  type UnpaidOrderInput,
} from "@/lib/orders/unpaid";
import { resolveOrderLines, totalDurationMin } from "@/lib/orders/duration";
import { isOn15MinBoundary, suggestFreeSlots, type SlotProposal } from "@/lib/orders/slots";
import { isRangeOpen } from "@/lib/settings/availability";
import {
  bratislavaDateKey,
  bratislavaHHMM,
} from "@/lib/settings/availability";
import type { OverlapInfo } from "@/lib/orders/overlap";
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
const SERVICE_WOULD_OVERLAP_MESSAGE =
  "Službu nie je možné pridať: predĺžený termín by sa prekrýval s ďalšou rezerváciou.";
const SERVICE_WOULD_CLOSE_MESSAGE =
  "Službu nie je možné pridať: predĺžený termín presahuje otváracie hodiny.";

export interface CalendarBlock {
  order: OrderRow;
  client: Pick<ClientRow, "id" | "name" | "phone">;
  car: Pick<CarRow, "id" | "spz" | "brand" | "model" | "pricing_category">;
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
      "*, client:client_id(id,name,phone), car:car_id(id,spz,brand,model,pricing_category), services:order_services(*)",
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
    if (data.durationOverrideMin !== undefined || data.priceOverrideCents !== undefined) {
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

    // Box-overlap is allowed (migration 0016) but the manager must confirm it.
    // Detect a clash and return it as a soft conflict unless already confirmed.
    if (!data.allowOverlap) {
      const conflict = await findBoxOverlaps(db, data.box, startsAt, endsAt);
      if (conflict.orders.length > 0) {
        return { ok: false, message: CONFLICT_MESSAGE, conflict };
      }
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
        price_override_cents: data.priceOverrideCents ?? null,
        created_by: actor.id,
      })
      .select("id, starts_at, ends_at, box, duration_min, price_override_cents")
      .single();

    if (orderErr) throw orderErr;

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
      price_override_cents: orderRow.price_override_cents,
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
  workers: Array<OrderStaffRow & { worker: Pick<WorkerRow, "id" | "display_name" | "active"> }>;
}

/** Read one order with everything the detail page renders. Both roles. */
export async function getOrder(input: unknown): Promise<OrderDetail | null> {
  const { id } = getOrderSchema.parse(input);
  await getCurrentStaff();
  const db = getServiceClient();

  const { data, error } = await db
    .from("orders")
    .select(
      "*, client:client_id(*), car:car_id(*), services:order_services(*), workers:order_staff(*, worker:worker_id(id, display_name, active))",
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

export interface OrderSummary {
  id: string;
  startsAt: string;
  endsAt: string;
  box: number;
  status: OrderRow["status"];
  deleted: boolean;
  client: { name: string | null; phone: string } | null;
  car: { spz: string | null; brand: string | null; model: string | null } | null;
  services: string[];
}

/**
 * Lean read-only order overview for the audit popup — unlike `getOrder` it does
 * NOT filter `deleted_at`, so a deleted (cancelled) order referenced by an audit
 * row still resolves (its `/orders/[id]` page 404s). Both roles.
 */
export async function getOrderSummary(input: unknown): Promise<OrderSummary | null> {
  const { id } = getOrderSchema.parse(input);
  await getCurrentStaff();
  const db = getServiceClient();

  const { data, error } = await db
    .from("orders")
    .select(
      "id, starts_at, ends_at, box, status, deleted_at, client:client_id(name, phone), car:car_id(spz, brand, model), services:order_services(name_snapshot, quantity, removed_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const r = data as unknown as {
    id: string;
    starts_at: string;
    ends_at: string;
    box: number;
    status: OrderRow["status"];
    deleted_at: string | null;
    client: { name: string | null; phone: string } | null;
    car: { spz: string | null; brand: string | null; model: string | null } | null;
    services: { name_snapshot: string; quantity: number; removed_at: string | null }[] | null;
  };
  return {
    id: r.id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    box: r.box,
    status: r.status,
    deleted: r.deleted_at != null,
    client: r.client,
    car: r.car,
    services: (r.services ?? [])
      .filter((s) => !s.removed_at)
      .map((s) => (s.quantity > 1 ? `${s.name_snapshot} ×${s.quantity}` : s.name_snapshot)),
  };
}

export interface RecentVisit {
  orderId: string;
  startsAt: string;
  carLabel: string;
  serviceNames: string[];
  status: OrderStatus;
}

/**
 * The car's most recent other orders (lightweight — for the order-detail
 * "História auta" box). Scoped by `car_id`, **not** client, so a car shared by
 * several clients shows every past visit on the car (what matters at the box is
 * the vehicle's history, not one owner's). Newest-first, excludes the current
 * order and cancelled (soft-deleted) ones. Both roles; gated on an active staff
 * identity.
 */
export async function getRecentCarVisits(input: {
  carId: string;
  excludeOrderId: string;
  limit?: number;
}): Promise<RecentVisit[]> {
  await getCurrentStaff();
  const limit = input.limit ?? 3;
  const db = getServiceClient();
  const { data, error } = await db
    .from("orders")
    .select(
      "id, starts_at, status, car:car_id(spz, brand, model), services:order_services(name_snapshot, removed_at)",
    )
    .eq("car_id", input.carId)
    .is("deleted_at", null)
    .neq("id", input.excludeOrderId)
    .order("starts_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((o) => {
    const car = o.car as { spz: string | null; brand: string | null; model: string | null } | null;
    return {
      orderId: o.id,
      startsAt: o.starts_at,
      carLabel: car ? formatCarPrimary(car) : "",
      serviceNames: (o.services ?? [])
        .filter((s: { removed_at: string | null }) => s.removed_at === null)
        .map((s: { name_snapshot: string }) => s.name_snapshot),
      status: o.status as OrderStatus,
    };
  });
}

export type { ClientFlags } from "@/lib/orders/unpaid";

/**
 * Warning flags for one client (overdue unpaid + no-shows) — surfaced in the
 * booking wizard, the client card and the order detail. Scoped to the orders
 * this client booked. Both roles; gated on an active staff identity.
 */
export async function getClientFlags(input: { clientId: string }): Promise<ClientFlags> {
  await getCurrentStaff();
  const db = getServiceClient();
  const { data, error } = await db
    .from("orders")
    .select("status, starts_at, deleted_at, price_override_cents, services:order_services(paid, removed_at, price_cents_snapshot)")
    .eq("client_id", input.clientId)
    .is("deleted_at", null);
  if (error) throw error;
  return computeClientFlags((data ?? []) as unknown as UnpaidOrderInput[], bratislavaDateKey(new Date()));
}

export interface OrderDetailBundle {
  detail: OrderDetail;
  allWorkers: Array<Pick<WorkerRow, "id" | "display_name" | "active">>;
  sms: SmsMessageRow[];
  recentVisits: RecentVisit[];
  clientFlags: ClientFlags;
}

/**
 * Everything the order-detail cards render, in one client-callable read — used
 * by the calendar popup Sheet (spec 15 §2.4). Composes the same reads the
 * `/orders/[id]` page does server-side (`getOrder` + active workers +
 * `getOrderSms` + recent visits + client flags); `getOrder` already gates on
 * `getCurrentStaff`. Returns null when the order is missing/cancelled (so the
 * Sheet can show an inline error). Read-only — no mutation, no authz change.
 */
export async function getOrderDetailBundle(input: unknown): Promise<OrderDetailBundle | null> {
  const { id } = getOrderSchema.parse(input);
  const detail = await getOrder({ id });
  if (!detail) return null;

  const db = getServiceClient();
  const [{ data: workerList, error: workerErr }, sms, recentVisits, clientFlags] =
    await Promise.all([
      db
        .from("workers")
        .select("id, display_name, active")
        .eq("active", true)
        .order("display_name"),
      getOrderSms({ orderId: id }),
      getRecentCarVisits({ carId: detail.car.id, excludeOrderId: id, limit: 3 }),
      getClientFlags({ clientId: detail.client.id }),
    ]);
  if (workerErr) throw workerErr;

  return { detail, allWorkers: workerList ?? [], sms, recentVisits, clientFlags };
}

export async function setStatus(input: unknown): Promise<ActionResult> {
  try {
    const { id, next, allowOverlap, sendSms } = setStatusSchema.parse(input);
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

    // The exception edge: nedostavil_sa → vytvorena re-checks hours (slot was
    // freed and may now fall outside open hours) and detects whether the slot
    // was rebooked. Overlap is allowed now (migration 0016) — return it as a
    // soft conflict the manager confirms, unless already confirmed.
    if (before.status === "nedostavil_sa" && next === "vytvorena") {
      const { data: full, error: fullErr } = await db
        .from("orders")
        .select("box, starts_at, ends_at")
        .eq("id", id)
        .single();
      if (fullErr) throw fullErr;
      const start = new Date(full.starts_at);
      const end = new Date(full.ends_at);
      if (!(await rangeIsOpen(db, start, end))) {
        return { ok: false, message: CLOSED_MESSAGE };
      }
      if (!allowOverlap) {
        const conflict = await findBoxOverlaps(db, full.box, start, end, id);
        if (conflict.orders.length > 0) {
          return { ok: false, message: REVERT_RETAKEN_MESSAGE, conflict };
        }
      }
    }

    const { error: updErr } = await db
      .from("orders")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updErr) throw updErr;

    // The "ready" SMS only fires on vytvorena → hotova, and the operator may
    // suppress it from the order detail (customer already on site).
    const isReadyTransition = before.status === "vytvorena" && next === "hotova";
    const smsSuppressed = isReadyTransition && sendSms === false;

    await writeAudit(
      actor,
      "order.status_change",
      "order",
      id,
      {
        from: before.status,
        to: next,
        ...(smsSuppressed ? { sms_suppressed: true } : {}),
      },
      id,
    );

    if (isReadyTransition && !smsSuppressed) {
      await emitOrderReady({
        orderId: id,
        actorEmail: actor.email,
        emittedAt: new Date(),
      });
    }

    // Marking the order paid settles every (non-removed) service line, so a
    // Zaplatená order drops off the unpaid view without per-line ticking. A
    // service added afterwards still defaults to unpaid (post-hoc workflow).
    if (next === "zaplatena") {
      const { error: paidErr } = await db
        .from("order_services")
        .update({ paid: true })
        .eq("order_id", id)
        .is("removed_at", null)
        .eq("paid", false);
      if (paidErr) throw paidErr;
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
    const { id, box, startsAt, durationMin, allowOverlap } = moveOrderSchema.parse(input);
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

    // Optional manual duration override (edit mode); else keep the stored one.
    const effectiveDuration = durationMin ?? before.duration_min;
    const newEnd = new Date(newStart.getTime() + effectiveDuration * 60_000);
    if (!(await rangeIsOpen(db, newStart, newEnd))) {
      return { ok: false, message: CLOSED_MESSAGE };
    }

    // Box-overlap allowed (migration 0016); confirm it. The order's own slot is
    // excluded so keeping the same time isn't a self-conflict.
    if (!allowOverlap) {
      const conflict = await findBoxOverlaps(db, box, newStart, newEnd, id);
      if (conflict.orders.length > 0) {
        return { ok: false, message: CONFLICT_MESSAGE, conflict };
      }
    }

    const { error: updErr } = await db
      .from("orders")
      .update({
        box,
        starts_at: newStart.toISOString(),
        duration_min: effectiveDuration,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updErr) throw updErr;

    await writeAudit(
      actor,
      "order.move",
      "order",
      id,
      {
        from: { box: before.box, starts_at: before.starts_at, duration_min: before.duration_min },
        to: { box, starts_at: newStart.toISOString(), duration_min: effectiveDuration },
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

/**
 * Switch an order to a different car of the SAME client (manager-only, spec 16
 * §2.10). The new car's pricing category re-prices every active service line, so
 * this re-snapshots their duration/price/category in place. Allowed only while
 * the order is still `vytvorena` — re-pricing must not rewrite the immutable
 * snapshots of a done/paid wash (PRD §10). The order's `duration_min` is
 * deliberately NOT recomputed here — the wizard edit flow re-runs `moveOrder`
 * with the final duration (which re-checks the box conflict + opening hours);
 * standalone callers should follow with a move when the duration changes.
 * Resolving all lines up front means a service that isn't available for the new
 * vehicle leaves the order untouched.
 *
 * NOTE: like the other multi-statement order actions, this is not a single DB
 * transaction. The line re-snapshots run BEFORE the `car_id` swap, so a failure
 * mid-way leaves `car_id` on the OLD car (and a retry — `car_id` still differs —
 * re-runs the whole re-snapshot idempotently rather than short-circuiting).
 */
export async function changeOrderCar(input: unknown): Promise<ActionResult> {
  try {
    const { id, carId } = changeOrderCarSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: order, error: oErr } = await db
      .from("orders")
      .select("id, client_id, car_id, status, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order || order.deleted_at) {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }
    // No-op when the car is unchanged.
    if (order.car_id === carId) return { ok: true };
    // Re-pricing is only safe while the wash hasn't happened — once hotová/
    // zaplatená the line snapshots are frozen history (spec 16 §2.10).
    if (order.status !== "vytvorena") {
      return { ok: false, message: "Auto možno zmeniť len na nevykonanej objednávke." };
    }

    // The new car must belong to the same client (data-model §2.4) — the wizard
    // only offers this client's cars, but enforce it server-side anyway.
    const { data: link, error: linkErr } = await db
      .from("client_cars")
      .select("client_id")
      .eq("client_id", order.client_id)
      .eq("car_id", carId)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) return { ok: false, message: "Auto nepatrí klientovi." };

    const { data: car, error: carErr } = await db
      .from("cars")
      .select("id, pricing_category")
      .eq("id", carId)
      .maybeSingle();
    if (carErr) throw carErr;
    if (!car) return { ok: false, message: "Auto sa nenašlo." };

    // Re-price every active line at the new car's category. Resolve them ALL
    // (and bail) before mutating, so an unavailable service leaves the order as-is.
    const { data: lineRows, error: linesErr } = await db
      .from("order_services")
      .select("id, service_id, name_snapshot, quantity")
      .eq("order_id", order.id)
      .is("removed_at", null);
    if (linesErr) throw linesErr;

    const active = lineRows ?? [];
    const serviceIds = [...new Set(active.map((l) => l.service_id))];
    const pricesByService = new Map<string, ServicePriceRow[]>();
    if (serviceIds.length > 0) {
      const { data: prices, error: pErr } = await db
        .from("service_prices")
        .select("*")
        .in("service_id", serviceIds);
      if (pErr) throw pErr;
      for (const p of prices ?? []) {
        const arr = pricesByService.get(p.service_id) ?? [];
        arr.push(p);
        pricesByService.set(p.service_id, arr);
      }
    }

    const resnaps: Array<{
      id: string;
      duration_min_snapshot: number | null;
      price_cents_snapshot: number;
    }> = [];
    for (const l of active) {
      const resolved = resolveServicePrice(
        pricesByService.get(l.service_id) ?? [],
        car.pricing_category,
      );
      if (!resolved.ok) {
        return {
          ok: false,
          message: `Službu „${l.name_snapshot}“ nie je možné preceniť pre tento typ vozidla. Najprv ju odstráňte.`,
        };
      }
      resnaps.push({
        id: l.id,
        duration_min_snapshot:
          resolved.durationMin != null ? resolved.durationMin * l.quantity : null,
        price_cents_snapshot: resolved.priceCents * l.quantity,
      });
    }

    // Re-snapshot each line's price/duration/category for the new vehicle FIRST…
    for (const r of resnaps) {
      const { error: rErr } = await db
        .from("order_services")
        .update({
          duration_min_snapshot: r.duration_min_snapshot,
          price_cents_snapshot: r.price_cents_snapshot,
          category_snapshot: car.pricing_category,
        })
        .eq("id", r.id);
      if (rErr) throw rErr;
    }

    // …then swap the car LAST, so a mid-loop failure leaves `car_id` on the old
    // car and a retry re-runs the full re-snapshot (the `car_id === carId` guard
    // above only short-circuits once the swap has fully committed).
    const { error: updErr } = await db
      .from("orders")
      .update({ car_id: carId, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    if (updErr) throw updErr;

    await writeAudit(
      actor,
      "order.car_change",
      "order",
      order.id,
      { from_car_id: order.car_id, to_car_id: carId, category: car.pricing_category },
      order.id,
    );

    revalidatePath("/");
    revalidatePath(`/orders/${order.id}`);
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
    const { id, workerId } = orderWorkerSchema.parse(input);
    const actor = await getCurrentStaff();
    const db = getServiceClient();

    // Ensure the assignee exists and is active (FK alone would allow inactive).
    const { data: assignee, error: aErr } = await db
      .from("workers")
      .select("id, active")
      .eq("id", workerId)
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
      .insert({ order_id: id, worker_id: workerId, assigned_by: actor.id });
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
      { worker_id: workerId },
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
    const { id, workerId } = orderWorkerSchema.parse(input);
    const actor = await getCurrentStaff();
    const db = getServiceClient();

    // Match the rest of the mutating actions: refuse to operate on a
    // soft-deleted (cancelled) order.
    const { data: order, error: oErr } = await db
      .from("orders")
      .select("id, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order || order.deleted_at) {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }

    const { error: delErr, count } = await db
      .from("order_staff")
      .delete({ count: "exact" })
      .eq("order_id", id)
      .eq("worker_id", workerId);
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
      { worker_id: workerId },
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

/**
 * Manager-only manual order total override (cents). `priceOverrideCents = null`
 * clears it (the total reverts to the line sum). Audited as
 * `order.price_override` with from/to. Does not touch the per-line `paid` rows.
 */
export async function setOrderPrice(input: unknown): Promise<ActionResult> {
  try {
    const { id, priceOverrideCents } = setOrderPriceSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeErr } = await db
      .from("orders")
      .select("price_override_cents, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before || before.deleted_at) {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }

    const { error: updErr } = await db
      .from("orders")
      .update({ price_override_cents: priceOverrideCents, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updErr) throw updErr;

    await writeAudit(
      actor,
      "order.price_override",
      "order",
      id,
      { from: before.price_override_cents, to: priceOverrideCents },
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

    // Σ of the current active-line durations; the new line is added on top to
    // get the order's recomputed duration (services drive the time — a prior
    // manual override is overwritten when a service is added).
    const baselineDuration = await sumActiveLineDuration(db, order.id);

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

    // Recompute the duration to Σ active lines + this new line (overwriting any
    // manual override), and validate the longer booking BEFORE inserting the
    // line: it must stay within opening hours and not overlap another booking in
    // the box — i.e. check whether the service can be added at all. Skipped when
    // the caller owns the duration (wizard edit, where moveOrder already set it).
    const recompute = data.recomputeDuration ?? true;
    const newDuration = baselineDuration + lineDuration;
    if (recompute && newDuration > 0 && newDuration !== order.duration_min) {
      const start = new Date(order.starts_at);
      const newEnd = new Date(start.getTime() + newDuration * 60_000);
      if (!(await rangeIsOpen(db, start, newEnd))) {
        return { ok: false, message: SERVICE_WOULD_CLOSE_MESSAGE };
      }
      // The longer booking may now reach into a neighbour; overlap is allowed
      // (migration 0016) but confirmed. Excludes the order's own slot.
      if (!data.allowOverlap) {
        const conflict = await findBoxOverlaps(db, order.box, start, newEnd, order.id);
        if (conflict.orders.length > 0) {
          return { ok: false, message: SERVICE_WOULD_OVERLAP_MESSAGE, conflict };
        }
      }
      const { error: durErr } = await db
        .from("orders")
        .update({ duration_min: newDuration, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (durErr) throw durErr;
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
    const { orderServiceId, recomputeDuration } = removeOrderServiceSchema.parse(input);
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
    // BEFORE the removal). With override active, leave the slot alone. Skipped
    // entirely when the caller owns the duration (wizard edit, moveOrder).
    if (parent && (recomputeDuration ?? true)) {
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

/**
 * Live orders in `box` whose `[starts_at, ends_at)` overlaps `[start, end)`,
 * shaped for the "warn but allow" confirm dialog (migration 0016). Excludes the
 * order itself (edit/move), soft-deleted, and `nedostavil_sa` (slot freed).
 * Empty `orders` ⇒ no clash.
 */
async function findBoxOverlaps(

  db: any,
  box: number,
  start: Date,
  end: Date,
  excludeOrderId?: string,
): Promise<OverlapInfo> {
  let q = db
    .from("orders")
    .select("id, box, starts_at, ends_at, car:car_id(spz, brand, model)")
    .eq("box", box)
    .is("deleted_at", null)
    .neq("status", "nedostavil_sa")
    .lt("starts_at", end.toISOString())
    .gt("ends_at", start.toISOString())
    .order("starts_at");
  if (excludeOrderId) q = q.neq("id", excludeOrderId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    box: number;
    starts_at: string;
    ends_at: string;
    car: Pick<CarRow, "spz" | "brand" | "model"> | null;
  }>;
  return {
    orders: rows.map((r) => ({
      id: r.id,
      box: r.box,
      startHHMM: bratislavaHHMM(new Date(r.starts_at)),
      endHHMM: bratislavaHHMM(new Date(r.ends_at)),
      carLabel: r.car ? formatCarPrimary(r.car) : "",
    })),
  };
}

// ---------------------------------------------------------------------------
// Spec 10 — unpaid-order alerts (manager-only, read-only/derived)
// ---------------------------------------------------------------------------

export interface UnpaidOrderRow {
  id: string;
  startsAt: string;
  status: OrderRow["status"];
  overdue: boolean;
  clientName: string | null;
  clientPhone: string;
  spz: string | null;
  brand: string | null;
  model: string | null;
  serviceNames: string[];
  unpaidAmountCents: number;
}

export interface UnpaidOrdersResult {
  orders: UnpaidOrderRow[];
  overdueCount: number;
  todayCount: number;
}

interface UnpaidCandidate {
  id: string;
  starts_at: string;
  status: OrderRow["status"];
  deleted_at: string | null;
  price_override_cents: number | null;
  client: Pick<ClientRow, "name" | "phone"> | null;
  car: Pick<CarRow, "spz" | "brand" | "model"> | null;
  services: Array<
    Pick<OrderServiceRow, "paid" | "removed_at" | "price_cents_snapshot" | "name_snapshot">
  >;
}

/**
 * The candidate superset for the unpaid scan: not soft-deleted, and in a state
 * that can owe money (`hotova` or `zaplatena` — `vytvorena`/`nedostavil_sa` can
 * never be unpaid). `isUnpaid` does the precise filtering. Fetch-and-filter is
 * sanctioned for Phase 1 (spec §2.5); if the `zaplatena` history grows heavy,
 * add the partial index from §2.5 or narrow via an unpaid-line subquery.
 */
async function fetchUnpaidCandidates(): Promise<UnpaidCandidate[]> {
  const { data, error } = await getServiceClient()
    .from("orders")
    .select(
      "id, starts_at, status, deleted_at, price_override_cents, client:client_id(name, phone), car:car_id(spz, brand, model), services:order_services(paid, removed_at, price_cents_snapshot, name_snapshot)",
    )
    .is("deleted_at", null)
    .in("status", ["hotova", "zaplatena"]);
  if (error) throw error;
  return (data ?? []) as unknown as UnpaidCandidate[];
}

/** Manager-only list of unpaid orders, overdue first (spec 10). */
export async function getUnpaidOrders(input?: unknown): Promise<UnpaidOrdersResult> {
  const { scope } = getUnpaidOrdersSchema.parse(input ?? {});
  const actor = await getCurrentStaff();
  requireManager(actor);

  const today = bratislavaDateKey(new Date());
  const candidates = await fetchUnpaidCandidates();

  const rows: UnpaidOrderRow[] = [];
  for (const c of candidates) {
    if (!isUnpaid(c)) continue;
    const overdue = isOverdue(c, today);
    rows.push({
      id: c.id,
      startsAt: c.starts_at,
      status: c.status,
      overdue,
      clientName: c.client?.name ?? null,
      clientPhone: c.client?.phone ?? "",
      spz: c.car?.spz ?? null,
      brand: c.car?.brand ?? null,
      model: c.car?.model ?? null,
      serviceNames: c.services
        .filter((l) => l.removed_at === null)
        .map((l) => l.name_snapshot),
      unpaidAmountCents: unpaidAmountCents(c),
    });
  }

  const overdueCount = rows.filter((r) => r.overdue).length;
  const todayCount = rows.length - overdueCount;

  // Newest first (most recent unpaid order at the top).
  rows.sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const orders = scope === "overdue" ? rows.filter((r) => r.overdue) : rows;
  return { orders, overdueCount, todayCount };
}

/** Lightweight overdue count for the header badge (manager-only). */
export async function getUnpaidCount(): Promise<number> {
  const actor = await getCurrentStaff();
  requireManager(actor);

  const today = bratislavaDateKey(new Date());
  const candidates = await fetchUnpaidCandidates();
  return candidates.filter((c) => isOverdue(c, today)).length;
}
