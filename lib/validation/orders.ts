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

// Manual order total in cents (manager-only). Capped at 100 000 € to catch
// fat-finger entries; 0 is allowed (a free wash).
const priceOverrideCentsSchema = z.number().int().min(0).max(10_000_000);

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
  // Manager-only manual order total (cents); omitted keeps the computed line sum.
  priceOverrideCents: priceOverrideCentsSchema.optional(),
  note: z.string().trim().max(2000).optional(),
  // Box-overlap is allowed (migration 0016); when false/omitted the action
  // returns a soft conflict the UI confirms, then retries with true.
  allowOverlap: z.boolean().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type GetCalendarInput = z.infer<typeof getCalendarSchema>;
export type SuggestSlotsInput = z.infer<typeof suggestSlotsSchema>;

// ---------------------------------------------------------------------------
// Spec 06 — order detail & lifecycle
// ---------------------------------------------------------------------------

const orderStatusSchema = z.enum(
  ["vytvorena", "hotova", "zaplatena", "nedostavil_sa"],
  { message: "Neplatný stav objednávky." },
);

export const getOrderSchema = z.object({ id: idSchema });

export const setStatusSchema = z.object({
  id: idSchema,
  next: orderStatusSchema,
  // Confirms an overlap when reverting nedostavil_sa → vytvorena (migration 0016).
  allowOverlap: z.boolean().optional(),
  // Gates the "ready" SMS on the vytvorena → hotova advance only. Absent/true
  // sends (the default); false suppresses it (customer already on site).
  sendSms: z.boolean().optional(),
});

export const moveOrderSchema = z.object({
  id: idSchema,
  box: boxSchema,
  startsAt: isoInstantSchema,
  // Optional manual duration (min) — set from the wizard's "Trvanie" override in
  // edit mode; omitted keeps the order's stored duration.
  durationMin: z.number().int().positive().max(24 * 60).optional(),
  allowOverlap: z.boolean().optional(),
});

export const changeOrderCarSchema = z.object({
  id: idSchema,
  // The car to switch the order to — must belong to the same client. Its
  // pricing_category re-prices every active service line.
  carId: idSchema,
});

export const deleteOrderSchema = z.object({ id: idSchema });

export const orderWorkerSchema = z.object({
  id: idSchema,
  workerId: idSchema,
});

export const setNoteSchema = z.object({
  id: idSchema,
  note: z.string().trim().max(2000).nullable(),
});

export const addOrderServiceSchema = z.object({
  id: idSchema,
  serviceId: idSchema,
  quantity: z.number().int().positive().max(99).optional(),
  // When false, don't recompute/validate the order's duration here — the caller
  // (the wizard edit flow) owns the final duration via moveOrder. Default true:
  // the order-detail "add service" extends the booking and checks it fits.
  recomputeDuration: z.boolean().optional(),
  // Confirms an overlap when the longer booking would reach into a neighbour.
  allowOverlap: z.boolean().optional(),
});

export const removeOrderServiceSchema = z.object({
  orderServiceId: idSchema,
  // See addOrderServiceSchema: when false, leave the order's duration untouched.
  recomputeDuration: z.boolean().optional(),
});

export const setOrderServicePaidSchema = z.object({
  orderServiceId: idSchema,
  paid: z.boolean(),
});

export const setOrderPriceSchema = z.object({
  id: idSchema,
  // null clears the override → the order total reverts to the line sum.
  priceOverrideCents: priceOverrideCentsSchema.nullable(),
});

export const getUnpaidOrdersSchema = z.object({
  scope: z.enum(["overdue", "all"]).optional(),
});

export type SetStatusInput = z.infer<typeof setStatusSchema>;
export type MoveOrderInput = z.infer<typeof moveOrderSchema>;
export type ChangeOrderCarInput = z.infer<typeof changeOrderCarSchema>;
export type OrderWorkerInput = z.infer<typeof orderWorkerSchema>;
export type SetNoteInput = z.infer<typeof setNoteSchema>;
export type AddOrderServiceInput = z.infer<typeof addOrderServiceSchema>;
