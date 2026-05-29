import { z } from "zod";

/**
 * zod schemas for worker (Zamestnanci) Server Actions (spec 11). Workers are
 * order-assignable names — no email, no role. Validated at every action
 * boundary (CLAUDE.md). No uniqueness on name: two "Jano" are allowed;
 * soft-delete preserves history either way.
 */

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Meno je povinné.")
  .max(120, "Meno je príliš dlhé.");

const idSchema = z.string().uuid("Neplatný identifikátor.");

export const createWorkerSchema = z.object({
  display_name: displayNameSchema,
});

export const updateWorkerSchema = z.object({
  id: idSchema,
  display_name: displayNameSchema,
});

export const setWorkerActiveSchema = z.object({
  id: idSchema,
  active: z.boolean(),
});

export type CreateWorkerInput = z.infer<typeof createWorkerSchema>;
export type UpdateWorkerInput = z.infer<typeof updateWorkerSchema>;
export type SetWorkerActiveInput = z.infer<typeof setWorkerActiveSchema>;
