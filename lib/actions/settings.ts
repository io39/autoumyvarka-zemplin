"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/server";
import type { OpeningHoursRow, DayOverrideRow } from "@/lib/supabase/types";
import { type ActionResult, toActionError } from "./result";
import {
  saveOpeningHoursSchema,
  upsertDayOverrideSchema,
  removeDayOverrideSchema,
  getDayOverridesSchema,
} from "@/lib/validation/settings";

const NOT_FOUND_MESSAGE = "Záznam sa nenašiel.";

/** List the 7 weekday rows in 0=Mon … 6=Sun order. Both roles. */
export async function getOpeningHours(): Promise<OpeningHoursRow[]> {
  await getCurrentStaff();
  const { data, error } = await getServiceClient()
    .from("opening_hours")
    .select("*")
    .order("day_of_week");
  if (error) throw error;
  return data ?? [];
}

/** List day overrides in a date range (default: all). Both roles. */
export async function getDayOverrides(input: unknown = undefined): Promise<DayOverrideRow[]> {
  const parsed = getDayOverridesSchema.parse(input);
  await getCurrentStaff();
  const db = getServiceClient();
  let q = db.from("day_overrides").select("*").order("day");
  if (parsed?.from) q = q.gte("day", parsed.from);
  if (parsed?.to) q = q.lte("day", parsed.to);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function saveOpeningHours(input: unknown): Promise<ActionResult> {
  try {
    const data = saveOpeningHoursSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeErr } = await db
      .from("opening_hours")
      .select("*")
      .order("day_of_week");
    if (beforeErr) throw beforeErr;

    // Sort by day_of_week so the upsert payload matches the PK order; clear
    // times when a day is closed so the DB constraint (closed ⇒ NULL times)
    // is always satisfied.
    const sorted = [...data.rows].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const payload = sorted.map((r) => ({
      day_of_week: r.dayOfWeek,
      is_closed: r.isClosed,
      open_time: r.isClosed ? null : (r.openTime ?? null),
      close_time: r.isClosed ? null : (r.closeTime ?? null),
    }));

    const { error } = await db
      .from("opening_hours")
      .upsert(payload, { onConflict: "day_of_week" });
    if (error) throw error;

    await writeAudit(actor, "settings.hours_update", "opening_hours", "00000000-0000-0000-0000-000000000000", {
      from: before ?? [],
      to: payload,
    });

    revalidatePath("/settings/hours");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function upsertDayOverride(input: unknown): Promise<ActionResult> {
  try {
    const data = upsertDayOverrideSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: before, error: beforeErr } = await db
      .from("day_overrides")
      .select("*")
      .eq("day", data.day)
      .maybeSingle();
    if (beforeErr) throw beforeErr;

    const payload = {
      day: data.day,
      is_closed: data.isClosed,
      open_time: data.isClosed ? null : (data.openTime ?? null),
      close_time: data.isClosed ? null : (data.closeTime ?? null),
      label: data.label ?? null,
    };
    const { error } = await db
      .from("day_overrides")
      .upsert(payload, { onConflict: "day" });
    if (error) throw error;

    await writeAudit(actor, "settings.override_set", "day_override", "00000000-0000-0000-0000-000000000000", {
      day: data.day,
      from: before ?? null,
      to: payload,
    });

    revalidatePath("/settings/exceptions");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeDayOverride(input: unknown): Promise<ActionResult> {
  try {
    const data = removeDayOverrideSchema.parse(input);
    const actor = await getCurrentStaff();
    requireManager(actor);
    const db = getServiceClient();

    const { data: removed, error } = await db
      .from("day_overrides")
      .delete()
      .eq("day", data.day)
      .select("*");
    if (error) throw error;
    if (!removed || removed.length === 0) return { ok: false, message: NOT_FOUND_MESSAGE };

    await writeAudit(actor, "settings.override_remove", "day_override", "00000000-0000-0000-0000-000000000000", {
      day: data.day,
      removed: removed[0],
    });

    revalidatePath("/settings/exceptions");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
