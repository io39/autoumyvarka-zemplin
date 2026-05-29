"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/server";
import type { WorkerRow } from "@/lib/supabase/types";
import { type ActionResult, toActionError } from "./result";
import {
  createWorkerSchema,
  updateWorkerSchema,
  setWorkerActiveSchema,
} from "@/lib/validation/workers";

const NOT_FOUND_MESSAGE = "Zamestnanec sa nenašiel.";

/** List all workers (active + inactive). Manager-only — also gated at the page. */
export async function listWorkers(): Promise<WorkerRow[]> {
  const actor = await getCurrentStaff();
  requireManager(actor);

  const { data, error } = await getServiceClient()
    .from("workers")
    .select("*")
    .order("active", { ascending: false })
    .order("display_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createWorker(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const data = createWorkerSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);

    const { data: row, error } = await getServiceClient()
      .from("workers")
      .insert({ display_name: data.display_name })
      .select("id")
      .single();
    if (error) throw error;

    await writeAudit(actor, "worker.create", "worker", row.id, {
      display_name: data.display_name,
    });

    revalidatePath("/staff");
    return { ok: true, id: row.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateWorker(input: unknown): Promise<ActionResult> {
  try {
    const data = updateWorkerSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeError } = await db
      .from("workers")
      .select("display_name")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return { ok: false, message: NOT_FOUND_MESSAGE };

    const { error } = await db
      .from("workers")
      .update({ display_name: data.display_name })
      .eq("id", data.id);
    if (error) throw error;

    await writeAudit(actor, "worker.update", "worker", data.id, {
      from: { display_name: before.display_name },
      to: { display_name: data.display_name },
    });

    revalidatePath("/staff");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setWorkerActive(input: unknown): Promise<ActionResult> {
  try {
    const data = setWorkerActiveSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeError } = await db
      .from("workers")
      .select("active")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return { ok: false, message: NOT_FOUND_MESSAGE };

    const { error } = await db.from("workers").update({ active: data.active }).eq("id", data.id);
    if (error) throw error;

    await writeAudit(
      actor,
      data.active ? "worker.activate" : "worker.deactivate",
      "worker",
      data.id,
      { from: { active: before.active }, to: { active: data.active } },
    );

    revalidatePath("/staff");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
