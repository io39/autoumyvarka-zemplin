import { z } from "zod";

/**
 * zod schemas for the settings Server Actions (spec 04 §2.3). Times are
 * "HH:MM" strings on a 15-minute boundary — the calendar (spec 05) snaps
 * to 15-min slots, so opening hours must too.
 */

const TIME_HHMM = /^([01]\d|2[0-3]):(00|15|30|45)$/;

const timeSchema = z
  .string()
  .regex(TIME_HHMM, "Čas musí byť na štvrťhodine (napr. 08:00, 08:15).");

const dayOfWeekSchema = z
  .number()
  .int()
  .min(0, "Deň v týždni musí byť 0–6.")
  .max(6, "Deň v týždni musí byť 0–6.");

const labelSchema = z.string().trim().max(120, "Popis je príliš dlhý.").optional();

const hoursRowSchema = z
  .object({
    dayOfWeek: dayOfWeekSchema,
    isClosed: z.boolean(),
    openTime: timeSchema.optional(),
    closeTime: timeSchema.optional(),
  })
  .refine((v) => v.isClosed || (v.openTime && v.closeTime), {
    message: "Pri otvorenom dni je potrebný čas otvorenia aj zatvorenia.",
    path: ["openTime"],
  })
  .refine((v) => v.isClosed || (v.openTime && v.closeTime && v.openTime < v.closeTime), {
    message: "Čas otvorenia musí byť pred časom zatvorenia.",
    path: ["closeTime"],
  });

export const saveOpeningHoursSchema = z.object({
  rows: z
    .array(hoursRowSchema)
    .length(7, "Očakáva sa 7 riadkov (Po–Ne).")
    .refine(
      (rows) => new Set(rows.map((r) => r.dayOfWeek)).size === 7,
      { message: "Každý deň v týždni musí byť uvedený práve raz.", path: ["rows"] },
    ),
});

// Accept ISO date "YYYY-MM-DD". The DB column is `date`; supabase-js sends
// the string through unchanged.
const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný dátum.");

export const upsertDayOverrideSchema = z
  .object({
    day: daySchema,
    isClosed: z.boolean(),
    openTime: timeSchema.optional(),
    closeTime: timeSchema.optional(),
    label: labelSchema,
  })
  .refine((v) => v.isClosed || (v.openTime && v.closeTime), {
    message: "Pri otvorenom dni je potrebný čas otvorenia aj zatvorenia.",
    path: ["openTime"],
  })
  .refine((v) => v.isClosed || (v.openTime && v.closeTime && v.openTime < v.closeTime), {
    message: "Čas otvorenia musí byť pred časom zatvorenia.",
    path: ["closeTime"],
  });

export const removeDayOverrideSchema = z.object({ day: daySchema });

export const getDayOverridesSchema = z
  .object({ from: daySchema.optional(), to: daySchema.optional() })
  .optional();

export type SaveOpeningHoursInput = z.infer<typeof saveOpeningHoursSchema>;
export type UpsertDayOverrideInput = z.infer<typeof upsertDayOverrideSchema>;
