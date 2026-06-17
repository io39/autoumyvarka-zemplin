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
 *  - no ŠPZ (plateless)  → always create car + link        (no dedup possible)
 *  - no match            → create car + link              (audit car.create)
 *  - match, this client  → no-op notice
 *  - match, not linked   → needsLinkConfirm → linkExistingCar (audit car.link)
 */
export async function addCarToClient(input: unknown): Promise<AddCarResult> {
  try {
    const data = addCarToClientSchema.parse(input);
    const actor = await getCurrentStaff();
    const db = getServiceClient();

    // A plateless car has no shared key, so there is nothing to dedup/link
    // against — skip the lookup and always create a fresh, client-owned car.
    if (data.spz != null) {
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
    }

    // No such ŠPZ (or plateless) → create the car and link it.
    const { data: car, error: carErr } = await db
      .from("cars")
      .insert({
        spz: data.spz,
        brand: data.brand ?? null,
        model: data.model ?? null,
        pricing_category: data.pricingCategory,
      })
      .select("id")
      .single();

    // Lost a race (the ŠPZ was created between our lookup and insert): fall back
    // to the link path so the user still gets the friendly confirm, not a crash.
    // Only possible with a real plate — plateless cars are NULL (never collide).
    if (data.spz != null && isUniqueViolation(carErr)) {
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
      brand: data.brand ?? null,
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

/**
 * Edit car fields (ŠPZ, model, category) — manager only (mirrors order-data
 * editing). A manager may add a plate to a previously plateless car; if that
 * plate already belongs to another car row we reject (the shared-ŠPZ merge is
 * not a silent update — the existing car should be used instead).
 */
export async function updateCar(input: unknown): Promise<ActionResult> {
  try {
    const data = updateCarSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeErr } = await db
      .from("cars")
      .select("spz, brand, model, pricing_category")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before) return { ok: false, message: "Auto sa nenašlo." };

    // Clearing the plate off a *shared* car would silently break the shared-ŠPZ
    // link (PRD §13#1): the car goes plateless, so future adds of that plate
    // create a new unlinked row instead of linking here. Block it on a car that
    // more than one client owns; a single-owner car may go plateless freely.
    if (before.spz != null && data.spz == null) {
      const { count, error: linkCountErr } = await db
        .from("client_cars")
        .select("*", { count: "exact", head: true })
        .eq("car_id", data.id);
      if (linkCountErr) throw linkCountErr;
      if ((count ?? 0) > 1) {
        return {
          ok: false,
          message: "Auto je zdieľané s viacerými klientmi — ŠPZ nie je možné odstrániť.",
        };
      }
    }

    // Setting/changing the plate: guard against colliding with another car's
    // plate (the UNIQUE index also backstops this, caught as 23505 below).
    if (data.spz != null && data.spz !== before.spz) {
      const { data: clash, error: clashErr } = await db
        .from("cars")
        .select("id")
        .eq("spz", data.spz)
        .neq("id", data.id)
        .maybeSingle();
      if (clashErr) throw clashErr;
      if (clash) {
        return {
          ok: false,
          message: "Auto s touto ŠPZ už existuje. Použite existujúce auto.",
        };
      }
    }

    const { error } = await db
      .from("cars")
      .update({
        spz: data.spz,
        brand: data.brand ?? null,
        model: data.model ?? null,
        pricing_category: data.pricingCategory,
      })
      .eq("id", data.id);
    if (isUniqueViolation(error)) {
      return { ok: false, message: "Auto s touto ŠPZ už existuje. Použite existujúce auto." };
    }
    if (error) throw error;

    await writeAudit(actor, "car.update", "car", data.id, {
      from: { spz: before.spz, brand: before.brand, model: before.model, pricing_category: before.pricing_category },
      to: { spz: data.spz, brand: data.brand ?? null, model: data.model ?? null, pricing_category: data.pricingCategory },
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
