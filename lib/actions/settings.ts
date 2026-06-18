"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/server";
import type { OpeningHoursRow, DayOverrideRow, OrderStatus } from "@/lib/supabase/types";
import { type ActionResult, toActionError } from "./result";
import type { OutsideHoursWarning } from "./result";
import { bratislavaDateKey, bratislavaDateDisplay, bratislavaHHMM } from "@/lib/settings/availability";
import { bratislavaLocalDayRange } from "@/lib/time/bratislava";
import { isOutsideHours } from "@/lib/orders/out-of-hours";
import { formatCarLabel, NO_SPZ_LABEL } from "@/lib/cars/format";
import {
  saveOpeningHoursSchema,
  upsertDayOverrideSchema,
  removeDayOverrideSchema,
  getDayOverridesSchema,
} from "@/lib/validation/settings";

const NOT_FOUND_MESSAGE = "Záznam sa nenašiel.";
const OUTSIDE_HOURS_MESSAGE = "Táto zmena ponechá objednávky mimo otváracích hodín.";

/**
 * Upcoming vytvorená orders (today onward, optionally just one date) that would
 * fall OUTSIDE the PROPOSED hours config. Returns an OutsideHoursWarning (count +
 * up to 5 samples) or null when none. Reuses isOutsideHours.
 */
async function checkOutsideHours(
  db: ReturnType<typeof getServiceClient>,
  proposedHours: OpeningHoursRow[],
  proposedOverrides: DayOverrideRow[],
  dayFilter?: string,
): Promise<OutsideHoursWarning | null> {
  const today = bratislavaDateKey(new Date());
  let q = db
    .from("orders")
    .select("id, starts_at, ends_at, status, deleted_at, car:car_id(spz, brand, model)")
    .is("deleted_at", null)
    .eq("status", "vytvorena")
    .gte("starts_at", bratislavaLocalDayRange(today).start.toISOString())
    .order("starts_at");
  if (dayFilter) {
    const range = bratislavaLocalDayRange(dayFilter);
    q = q.lt("starts_at", range.end.toISOString());
  }
  const { data, error } = await q;
  if (error) throw error;

  type Row = {
    id: string;
    starts_at: string;
    ends_at: string;
    status: OrderStatus;
    deleted_at: string | null;
    car: { spz: string | null; brand: string | null; model: string | null } | null;
  };
  const affected = ((data ?? []) as unknown as Row[]).filter((o) =>
    isOutsideHours(o, proposedHours, proposedOverrides, today),
  );
  if (affected.length === 0) return null;
  return {
    count: affected.length,
    sample: affected.slice(0, 5).map((o) => {
      const at = new Date(o.starts_at);
      const label = `${o.car?.spz || formatCarLabel(o.car?.brand ?? null, o.car?.model ?? null) || NO_SPZ_LABEL} · ${bratislavaDateDisplay(at)} ${bratislavaHHMM(at)}`;
      return { id: o.id, label };
    }),
  };
}

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

    if (!data.allowOutsideHours) {
      const { data: overrides } = await db.from("day_overrides").select("*");
      const warning = await checkOutsideHours(db, payload as OpeningHoursRow[], (overrides ?? []) as DayOverrideRow[]);
      if (warning) return { ok: false, message: OUTSIDE_HOURS_MESSAGE, outsideHoursWarning: warning };
    }

    const { error } = await db
      .from("opening_hours")
      .upsert(payload, { onConflict: "day_of_week" });
    if (error) throw error;

    // Settings audit rows: entity_type = "settings", entity_id = null
    // (config tables have non-uuid PKs; the meaningful key, if any, is
    // in `details`).
    await writeAudit(actor, "settings.hours_update", "settings", null, {
      table: "opening_hours",
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

    if (!data.allowOutsideHours) {
      const [{ data: hours }, { data: existing }] = await Promise.all([
        db.from("opening_hours").select("*"),
        db.from("day_overrides").select("*"),
      ]);
      const proposedOverrides = [
        ...((existing ?? []) as DayOverrideRow[]).filter((o) => o.day !== data.day),
        payload as DayOverrideRow,
      ];
      const warning = await checkOutsideHours(db, (hours ?? []) as OpeningHoursRow[], proposedOverrides, data.day);
      if (warning) return { ok: false, message: OUTSIDE_HOURS_MESSAGE, outsideHoursWarning: warning };
    }

    const { error } = await db
      .from("day_overrides")
      .upsert(payload, { onConflict: "day" });
    if (error) throw error;

    await writeAudit(actor, "settings.override_set", "settings", null, {
      table: "day_overrides",
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

    if (!data.allowOutsideHours) {
      const [{ data: hours }, { data: existing }] = await Promise.all([
        db.from("opening_hours").select("*"),
        db.from("day_overrides").select("*"),
      ]);
      const proposedOverrides = ((existing ?? []) as DayOverrideRow[]).filter((o) => o.day !== data.day);
      const warning = await checkOutsideHours(db, (hours ?? []) as OpeningHoursRow[], proposedOverrides, data.day);
      if (warning) return { ok: false, message: OUTSIDE_HOURS_MESSAGE, outsideHoursWarning: warning };
    }

    // Hard-delete is intentional here: a day override is an ad-hoc
    // exception, not domain history. CLAUDE.md's soft-delete rule
    // targets orders/services/clients (history integrity).
    const { data: removed, error } = await db
      .from("day_overrides")
      .delete()
      .eq("day", data.day)
      .select("*");
    if (error) throw error;
    if (!removed || removed.length === 0) return { ok: false, message: NOT_FOUND_MESSAGE };

    await writeAudit(actor, "settings.override_remove", "settings", null, {
      table: "day_overrides",
      day: data.day,
      removed: removed[0],
    });

    revalidatePath("/settings/exceptions");
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
