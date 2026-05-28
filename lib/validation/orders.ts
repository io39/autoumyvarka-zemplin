import { z } from "zod";

/**
 * zod schemas for booking + calendar Server Actions (spec 05 §2.4).
 * `startsAt` is an ISO 8601 instant (UTC); the 15-minute boundary check is
 * applied in the action (after parsing the timestamp) since zod can't see
 * minute alignment cleanly here.
 */

const idSchema = z.string().uuid("Neplatný identifikátor.");
const boxSchema = z.number().int().min(1).max(2);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný dátum.");

const isoInstantSchema = z
  .string()
  .min(1, "Termín je povinný.")
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Neplatný čas.");

const selectionSchema = z.object({
  serviceId: idSchema,
  quantity: z.number().int().positive().max(99).optional(),
});

export const getCalendarSchema = z.object({
  view: z.enum(["day", "week"], { message: "Neplatný typ pohľadu." }),
  date: dateOnlySchema,
  box: boxSchema.optional(),
});

export const suggestSlotsSchema = z.object({
  date: dateOnlySchema,
  durationMin: z.number().int().positive().max(24 * 60),
  box: boxSchema.optional(),
  limit: z.number().int().min(1).max(48).optional(),
});

export const createOrderSchema = z.object({
  clientId: idSchema,
  carId: idSchema,
  box: boxSchema,
  startsAt: isoInstantSchema,
  services: z.array(selectionSchema).min(1, "Vyberte aspoň jednu službu."),
  durationOverrideMin: z.number().int().positive().max(24 * 60).optional(),
  note: z.string().trim().max(2000).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type GetCalendarInput = z.infer<typeof getCalendarSchema>;
export type SuggestSlotsInput = z.infer<typeof suggestSlotsSchema>;
