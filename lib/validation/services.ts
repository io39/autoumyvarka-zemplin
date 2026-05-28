import { z } from "zod";

/**
 * zod schemas for the service-catalog Server Actions (spec 03 §2.3).
 * Prices are integer cents; durations are positive minutes or NULL ("no
 * scheduled time", e.g. dezinfekcia ozónom).
 */

const idSchema = z.string().uuid("Neplatný identifikátor.");
const nameSchema = z
  .string()
  .trim()
  .min(1, "Názov je povinný.")
  .max(120, "Názov je príliš dlhý.");
const kindSchema = z.enum(["main", "addon"], { message: "Neplatný typ služby." });
const categorySchema = z.enum(["os", "suv", "van", "dod", "motorka", "stavba"], {
  message: "Neplatná kategória.",
});

const priceRowSchema = z.object({
  pricingCategory: categorySchema.nullable(),
  durationMin: z.number().int().positive("Trvanie musí byť kladné.").nullable(),
  priceCents: z.number().int().min(0, "Cena nesmie byť záporná."),
  priceFrom: z.boolean().optional().default(false),
});

export const listServicesSchema = z.object({
  includeInactive: z.boolean().optional(),
});

export const getServicePriceSchema = z.object({
  serviceId: idSchema,
  category: categorySchema,
});

export const createServiceSchema = z.object({
  name: nameSchema,
  kind: kindSchema,
  isPerUnit: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional(),
  prices: z.array(priceRowSchema).min(1, "Pridajte aspoň jednu cenu."),
});

export const updateServiceSchema = z.object({
  id: idSchema,
  name: nameSchema,
  isPerUnit: z.boolean(),
  sortOrder: z.number().int().optional(),
});

export const upsertServicePriceSchema = z.object({
  serviceId: idSchema,
  pricingCategory: categorySchema.nullable(),
  durationMin: z.number().int().positive("Trvanie musí byť kladné.").nullable(),
  priceCents: z.number().int().min(0, "Cena nesmie byť záporná."),
  priceFrom: z.boolean().optional().default(false),
});

export const deleteServicePriceSchema = z.object({
  serviceId: idSchema,
  pricingCategory: categorySchema.nullable(),
});

export const setServiceActiveSchema = z.object({
  id: idSchema,
  active: z.boolean(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpsertServicePriceInput = z.infer<typeof upsertServicePriceSchema>;
