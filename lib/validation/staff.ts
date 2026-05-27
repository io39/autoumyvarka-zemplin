import { z } from "zod";

/**
 * zod schemas for staff Server Actions (spec 01 §2.3). Validated at every
 * action boundary (CLAUDE.md). Email is normalized to a trimmed lowercase form
 * so it matches the edge identity (which we also lowercase — identity.ts).
 */

const roleSchema = z.enum(["manazer", "prevadzka"], {
  message: "Neplatná rola.",
});

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email je povinný.")
  .email("Neplatný email.")
  .transform((v) => v.toLowerCase());

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Meno je povinné.")
  .max(120, "Meno je príliš dlhé.");

const idSchema = z.string().uuid("Neplatný identifikátor.");

export const createStaffSchema = z.object({
  email: emailSchema,
  display_name: displayNameSchema,
  role: roleSchema,
});

export const updateStaffSchema = z.object({
  id: idSchema,
  display_name: displayNameSchema,
  role: roleSchema,
});

export const setStaffActiveSchema = z.object({
  id: idSchema,
  active: z.boolean(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type SetStaffActiveInput = z.infer<typeof setStaffActiveSchema>;
