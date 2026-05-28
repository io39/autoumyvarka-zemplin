import { z } from "zod";

/**
 * zod schema for `getAuditLog` (spec 09 §2.2). `from`/`to` are Bratislava-local
 * calendar days (YYYY-MM-DD), inclusive on both ends — the action converts them
 * to a UTC [start, nextDayStart) range. `cursor` is the opaque keyset token.
 */
export const getAuditLogSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný dátum.")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný dátum.")
    .optional(),
  actions: z.array(z.string().min(1).max(64)).max(40).optional(),
  entityType: z.string().min(1).max(64).optional(),
  orderId: z.string().uuid("Neplatný identifikátor.").optional(),
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type GetAuditLogInput = z.infer<typeof getAuditLogSchema>;
