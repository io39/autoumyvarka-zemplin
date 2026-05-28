"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/server";
import type {
  ServiceKind,
  ServiceRow,
  ServicePriceRow,
} from "@/lib/supabase/types";
import {
  resolveServicePrice,
  type ServicePriceLookup,
} from "@/lib/services/price-lookup";
import { ZodError } from "zod";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { type ActionResult, toActionError } from "./result";
import {
  listServicesSchema,
  getServicePriceSchema,
  createServiceSchema,
  updateServiceSchema,
  upsertServicePriceSchema,
  deleteServicePriceSchema,
  setServiceActiveSchema,
} from "@/lib/validation/services";

const NOT_FOUND_MESSAGE = "Služba sa nenašla.";
const PRICE_EXISTS_MESSAGE = "Pre tento typ vozidla už cena existuje.";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export interface ServiceWithPrices {
  service: ServiceRow;
  prices: ServicePriceRow[];
}

/** List catalog entries (with their per-category prices). Both roles read. */
export async function listServices(input: unknown = {}): Promise<ServiceWithPrices[]> {
  const { includeInactive } = listServicesSchema.parse(input);
  await getCurrentStaff();
  const db = getServiceClient();

  let q = db.from("services").select("*").order("kind").order("sort_order");
  if (!includeInactive) q = q.eq("active", true);
  const { data: services, error } = await q;
  if (error) throw error;
  if (!services || services.length === 0) return [];

  const ids = services.map((s) => s.id);
  const { data: prices, error: pErr } = await db
    .from("service_prices")
    .select("*")
    .in("service_id", ids);
  if (pErr) throw pErr;

  const byService = new Map<string, ServicePriceRow[]>();
  for (const p of prices ?? []) {
    const arr = byService.get(p.service_id) ?? [];
    arr.push(p);
    byService.set(p.service_id, arr);
  }
  return services.map((s) => ({ service: s, prices: byService.get(s.id) ?? [] }));
}

/** Single service + its prices. Manager edit page. */
export async function getServiceWithPrices(id: string): Promise<ServiceWithPrices | null> {
  await getCurrentStaff();
  const db = getServiceClient();

  const { data: service, error } = await db
    .from("services")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!service) return null;

  const { data: prices, error: pErr } = await db
    .from("service_prices")
    .select("*")
    .eq("service_id", id);
  if (pErr) throw pErr;

  return { service, prices: prices ?? [] };
}

/**
 * Resolve the (service × category) row used at booking time. Falls back to
 * the NULL-category row for flat add-ons; otherwise returns the "not
 * available for this category" error so the booking flow can hide the service
 * rather than show a wrong price.
 */
export async function getServicePrice(input: unknown): Promise<ServicePriceLookup> {
  try {
    const { serviceId, category } = getServicePriceSchema.parse(input);
    await getCurrentStaff();

    const { data, error } = await getServiceClient()
      .from("service_prices")
      .select("*")
      .eq("service_id", serviceId);
    if (error) throw error;

    return resolveServicePrice(data ?? [], category);
  } catch (error) {
    // The return type is ServicePriceLookup, not ActionResult — emit a
    // lookup-shaped error so the booking flow (spec 05) can branch on
    // ok/!ok without checking for ActionResult-only extras.
    if (error instanceof ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Neplatné údaje." };
    }
    if (isForbiddenError(error) || isUnauthenticatedError(error)) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Nepodarilo sa načítať cenu služby." };
  }
}

export async function createService(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = createServiceSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: row, error } = await db
      .from("services")
      .insert({
        name: data.name,
        kind: data.kind as ServiceKind,
        is_per_unit: data.isPerUnit ?? false,
        sort_order: data.sortOrder ?? 0,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Insert the price rows; if the batch fails, the parent `services` row is
    // already committed (no cross-statement transaction over the JS client).
    // Roll forward by deleting the orphan so the catalog doesn't show a
    // service with no prices.
    const { data: insertedPrices, error: pErr } = await db
      .from("service_prices")
      .insert(
        data.prices.map((p) => ({
          service_id: row.id,
          pricing_category: p.pricingCategory,
          duration_min: p.durationMin,
          price_cents: p.priceCents,
          price_from: p.priceFrom ?? false,
        })),
      )
      .select("pricing_category, duration_min, price_cents, price_from");
    if (pErr) {
      await db.from("services").delete().eq("id", row.id);
      if (isUniqueViolation(pErr)) {
        return { ok: false, message: PRICE_EXISTS_MESSAGE };
      }
      throw pErr;
    }

    await writeAudit(actor, "service.create", "service", row.id, {
      name: data.name,
      kind: data.kind,
      is_per_unit: data.isPerUnit ?? false,
      prices: insertedPrices ?? [],
    });

    revalidatePath("/services");
    return { ok: true, id: row.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateService(input: unknown): Promise<ActionResult> {
  try {
    const data = updateServiceSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeError } = await db
      .from("services")
      .select("name, is_per_unit, sort_order")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return { ok: false, message: NOT_FOUND_MESSAGE };

    const next = {
      name: data.name,
      is_per_unit: data.isPerUnit,
      sort_order: data.sortOrder ?? before.sort_order,
    };
    const { error } = await db.from("services").update(next).eq("id", data.id);
    if (error) throw error;

    await writeAudit(actor, "service.update", "service", data.id, {
      from: before,
      to: next,
    });

    revalidatePath("/services");
    revalidatePath(`/services/${data.id}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function upsertServicePrice(input: unknown): Promise<ActionResult> {
  try {
    const data = upsertServicePriceSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    // Find existing row for (service, category) — NULL is treated as equal here
    // because of the migration's NULLS NOT DISTINCT constraint.
    let q = db.from("service_prices").select("*").eq("service_id", data.serviceId);
    q = data.pricingCategory === null
      ? q.is("pricing_category", null)
      : q.eq("pricing_category", data.pricingCategory);
    const { data: existing, error: lookupErr } = await q.maybeSingle();
    if (lookupErr) throw lookupErr;

    const payload = {
      service_id: data.serviceId,
      pricing_category: data.pricingCategory,
      duration_min: data.durationMin,
      price_cents: data.priceCents,
      price_from: data.priceFrom ?? false,
    };

    if (existing) {
      const priceFrom = data.priceFrom ?? false;
      const unchanged =
        existing.duration_min === data.durationMin &&
        existing.price_cents === data.priceCents &&
        existing.price_from === priceFrom;
      if (unchanged) {
        // No-op: skip the update and the audit entry (audit records state
        // changes; this isn't one).
        return { ok: true };
      }

      const { error } = await db
        .from("service_prices")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
      await writeAudit(actor, "service.price_update", "service", data.serviceId, {
        category: data.pricingCategory,
        from: {
          duration_min: existing.duration_min,
          price_cents: existing.price_cents,
          price_from: existing.price_from,
        },
        to: {
          duration_min: data.durationMin,
          price_cents: data.priceCents,
          price_from: priceFrom,
        },
      });
    } else {
      const { error } = await db.from("service_prices").insert(payload);
      if (isUniqueViolation(error)) {
        return { ok: false, message: PRICE_EXISTS_MESSAGE };
      }
      if (error) throw error;
      await writeAudit(actor, "service.price_update", "service", data.serviceId, {
        category: data.pricingCategory,
        from: null,
        to: {
          duration_min: data.durationMin,
          price_cents: data.priceCents,
          price_from: data.priceFrom ?? false,
        },
      });
    }

    revalidatePath("/services");
    revalidatePath(`/services/${data.serviceId}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteServicePrice(input: unknown): Promise<ActionResult> {
  try {
    const data = deleteServicePriceSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    let q = db
      .from("service_prices")
      .delete()
      .eq("service_id", data.serviceId)
      .select("id, pricing_category, duration_min, price_cents, price_from");
    q = data.pricingCategory === null
      ? q.is("pricing_category", null)
      : q.eq("pricing_category", data.pricingCategory);
    const { data: removed, error } = await q;
    if (error) throw error;
    if (!removed || removed.length === 0) return { ok: false, message: NOT_FOUND_MESSAGE };

    await writeAudit(actor, "service.price_delete", "service", data.serviceId, {
      category: data.pricingCategory,
      removed: removed[0],
    });

    revalidatePath("/services");
    revalidatePath(`/services/${data.serviceId}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setServiceActive(input: unknown): Promise<ActionResult> {
  try {
    const data = setServiceActiveSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeErr } = await db
      .from("services")
      .select("active")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before) return { ok: false, message: NOT_FOUND_MESSAGE };

    const { error } = await db
      .from("services")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw error;

    await writeAudit(
      actor,
      data.active ? "service.activate" : "service.deactivate",
      "service",
      data.id,
      { from: { active: before.active }, to: { active: data.active } },
    );

    revalidatePath("/services");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
