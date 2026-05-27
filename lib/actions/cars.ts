"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/server";
import type { CarRow } from "@/lib/supabase/types";
import { type ActionResult, toActionError } from "./result";
import {
  addCarToClientSchema,
  linkExistingCarSchema,
  updateCarSchema,
} from "@/lib/validation/clients";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export type AddCarResult =
  | { ok: true; carId: string }
  | { ok: true; alreadyLinked: true; carId: string }
  | { ok: true; needsLinkConfirm: true; existingCar: CarRow }
  | { ok: false; message: string };

/**
 * Add a car to a client (both roles). Shared-ŠPZ duplicate detection (spec 02
 * §2.3): an existing ŠPZ links rather than duplicates.
 *  - no match            → create car + link              (audit car.create)
 *  - match, this client  → no-op notice
 *  - match, not linked   → needsLinkConfirm → linkExistingCar (audit car.link)
 */
export async function addCarToClient(input: unknown): Promise<AddCarResult> {
  try {
    const data = addCarToClientSchema.parse(input);
    const actor = await getCurrentStaff();
    const db = getServiceClient();

    const { data: existing, error: lookupError } = await db
      .from("cars")
      .select("*")
      .eq("spz", data.spz)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing) {
      const { data: link, error: linkErr } = await db
        .from("client_cars")
        .select("client_id")
        .eq("client_id", data.clientId)
        .eq("car_id", existing.id)
        .maybeSingle();
      if (linkErr) throw linkErr;

      if (link) return { ok: true, alreadyLinked: true, carId: existing.id };
      // Exists under someone else (or unlinked) → ask the UI to confirm linking.
      return { ok: true, needsLinkConfirm: true, existingCar: existing };
    }

    // No such ŠPZ → create the car and link it.
    const { data: car, error: carErr } = await db
      .from("cars")
      .insert({ spz: data.spz, model: data.model ?? null, pricing_category: data.pricingCategory })
      .select("id")
      .single();

    // Lost a race (the ŠPZ was created between our lookup and insert): fall back
    // to the link path so the user still gets the friendly confirm, not a crash.
    if (isUniqueViolation(carErr)) {
      const { data: raced } = await db.from("cars").select("*").eq("spz", data.spz).maybeSingle();
      if (raced) return { ok: true, needsLinkConfirm: true, existingCar: raced };
    }
    if (carErr) throw carErr;

    const { error: linkInsErr } = await db
      .from("client_cars")
      .insert({ client_id: data.clientId, car_id: car.id });
    if (linkInsErr) throw linkInsErr;

    await writeAudit(actor, "car.create", "car", car.id, {
      spz: data.spz,
      model: data.model ?? null,
      pricing_category: data.pricingCategory,
      client_id: data.clientId,
    });

    revalidatePath(`/clients/${data.clientId}`);
    return { ok: true, carId: car.id };
  } catch (error) {
    return toActionError(error);
  }
}

/** Link an existing car to a client (the shared-ŠPZ confirm path). Both roles. */
export async function linkExistingCar(input: unknown): Promise<ActionResult> {
  try {
    const data = linkExistingCarSchema.parse(input);
    const actor = await getCurrentStaff();
    const db = getServiceClient();

    const { error } = await db
      .from("client_cars")
      .insert({ client_id: data.clientId, car_id: data.carId });

    // Already linked → idempotent no-op, not an error.
    if (isUniqueViolation(error)) return { ok: true };
    if (error) throw error;

    await writeAudit(actor, "car.link", "car", data.carId, { client_id: data.clientId });

    revalidatePath(`/clients/${data.clientId}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/** Edit car fields (model, category) — manager only (mirrors order-data editing). */
export async function updateCar(input: unknown): Promise<ActionResult> {
  try {
    const data = updateCarSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeErr } = await db
      .from("cars")
      .select("model, pricing_category")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before) return { ok: false, message: "Auto sa nenašlo." };

    const { error } = await db
      .from("cars")
      .update({ model: data.model ?? null, pricing_category: data.pricingCategory })
      .eq("id", data.id);
    if (error) throw error;

    await writeAudit(actor, "car.update", "car", data.id, {
      from: { model: before.model, pricing_category: before.pricing_category },
      to: { model: data.model ?? null, pricing_category: data.pricingCategory },
    });

    // A car may be linked to several clients (shared ŠPZ); purge every client
    // detail page, not just the list.
    revalidatePath("/clients");
    revalidatePath("/clients/[id]", "page");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
