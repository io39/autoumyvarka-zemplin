import { z } from "zod";

/**
 * zod schemas for spec 07 — both Server Actions and the two Route Handlers
 * (reminder trigger, provider webhook). Validating the webhook body at the
 * boundary is mandatory per CLAUDE.md.
 */

const idSchema = z.string().uuid("Neplatný identifikátor.");
const smsTypeSchema = z.enum(["reminder", "ready"]);

export const getOrderSmsSchema = z.object({ orderId: idSchema });

export const resendSmsSchema = z.object({ smsId: idSchema });

export const saveSmsTemplateSchema = z.object({
  type: smsTypeSchema,
  body: z.string().trim().min(1, "Šablóna nemôže byť prázdna.").max(1000),
});

/**
 * Provider delivery webhook (spec §2.5). Field names are deliberately
 * generic so a real provider adapter can map its payload to this shape.
 */
export const smsWebhookSchema = z.object({
  providerMessageId: z.string().min(1),
  status: z.enum(["delivered", "failed"]),
  deliveredAt: z.string().optional(),
  error: z.string().optional(),
});

export type SaveSmsTemplateInput = z.infer<typeof saveSmsTemplateSchema>;
export type SmsWebhookInput = z.infer<typeof smsWebhookSchema>;
