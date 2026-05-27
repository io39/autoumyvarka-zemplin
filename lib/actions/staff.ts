"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { ForbiddenError } from "@/lib/auth/errors";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/server";
import type { StaffRow } from "@/lib/supabase/types";
import { type ActionResult, toActionError } from "./result";
import {
  createStaffSchema,
  updateStaffSchema,
  setStaffActiveSchema,
} from "@/lib/validation/staff";
import { isSelfDeactivation } from "./staff-guards";

const DUPLICATE_EMAIL_MESSAGE = "Zamestnanec s týmto emailom už existuje.";
const SELF_DEACTIVATE_MESSAGE = "Nemôžete deaktivovať vlastný účet.";
const NOT_FOUND_MESSAGE = "Zamestnanec sa nenašiel.";

/** Postgres unique-violation SQLSTATE. */
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/** List all staff (active + inactive). Manager-only — also gated at the page. */
export async function listStaff(): Promise<StaffRow[]> {
  const actor = await getCurrentStaff();
  requireManager(actor);

  const { data, error } = await getServiceClient()
    .from("staff")
    .select("*")
    .order("active", { ascending: false })
    .order("display_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createStaff(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const data = createStaffSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);

    const { data: row, error } = await getServiceClient()
      .from("staff")
      .insert({ email: data.email, display_name: data.display_name, role: data.role })
      .select("id")
      .single();

    if (isUniqueViolation(error)) return { ok: false, message: DUPLICATE_EMAIL_MESSAGE };
    if (error) throw error;

    await writeAudit(actor, "staff.create", "staff", row.id, {
      email: data.email,
      display_name: data.display_name,
      role: data.role,
    });

    revalidatePath("/staff");
    return { ok: true, id: row.id };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateStaff(input: unknown): Promise<ActionResult> {
  try {
    const data = updateStaffSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    // Capture the before-state so the audit entry records from/to (data-model §2.11).
    const { data: before, error: beforeError } = await db
      .from("staff")
      .select("display_name, role")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return { ok: false, message: NOT_FOUND_MESSAGE };

    const { error } = await db
      .from("staff")
      .update({ display_name: data.display_name, role: data.role })
      .eq("id", data.id);
    if (error) throw error;

    await writeAudit(actor, "staff.update", "staff", data.id, {
      from: { display_name: before.display_name, role: before.role },
      to: { display_name: data.display_name, role: data.role },
    });

    revalidatePath("/staff");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setStaffActive(input: unknown): Promise<ActionResult> {
  try {
    const data = setStaffActiveSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);

    // Guard against lockout: a manager cannot deactivate their own account.
    if (isSelfDeactivation(actor.id, data.id, data.active)) {
      throw new ForbiddenError(SELF_DEACTIVATE_MESSAGE);
    }

    const db = getServiceClient();
    const { data: before, error: beforeError } = await db
      .from("staff")
      .select("active")
      .eq("id", data.id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return { ok: false, message: NOT_FOUND_MESSAGE };

    const { error } = await db.from("staff").update({ active: data.active }).eq("id", data.id);
    if (error) throw error;

    await writeAudit(actor, data.active ? "staff.activate" : "staff.deactivate", "staff", data.id, {
      from: { active: before.active },
      to: { active: data.active },
    });

    revalidatePath("/staff");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
