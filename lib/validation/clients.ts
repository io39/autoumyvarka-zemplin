import { z } from "zod";
import { normalizePhone } from "@/lib/clients/phone";
import { normalizeSpz } from "@/lib/cars/spz";

/**
 * zod schemas for client/car Server Actions (spec 02 §2.3). Phone and ŠPZ are
 * normalized + validated in the schema (transform), so every action boundary
 * stores and looks up the canonical form.
 */

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Telefónne číslo je povinné.")
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Neplatné telefónne číslo." });
      return z.NEVER;
    }
    return normalized;
  });

const spzSchema = z
  .string()
  .trim()
  .min(1, "ŠPZ je povinná.")
  .transform((v, ctx) => {
    const normalized = normalizeSpz(v);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Neplatná ŠPZ." });
      return z.NEVER;
    }
    return normalized;
  });

const nameSchema = z.string().trim().max(120, "Meno je príliš dlhé.").optional();
const brandSchema = z.string().trim().max(60, "Značka je príliš dlhá.").optional();
const modelSchema = z.string().trim().max(120, "Model je príliš dlhý.").optional();
const idSchema = z.string().uuid("Neplatný identifikátor.");
const categorySchema = z.enum(["os", "suv", "van", "dod", "motorka", "stavba"], {
  message: "Neplatná kategória.",
});

export const findClientByPhoneSchema = z.object({ phone: phoneSchema });

export const searchClientsSchema = z.object({
  query: z.string().trim().max(120),
  limit: z.number().int().min(1).max(50).optional(),
});

export const createClientSchema = z.object({
  phone: phoneSchema,
  name: nameSchema,
});

export const updateClientSchema = z.object({
  id: idSchema,
  phone: phoneSchema.optional(),
  name: nameSchema,
});

export const addCarToClientSchema = z.object({
  clientId: idSchema,
  spz: spzSchema,
  brand: brandSchema,
  model: modelSchema,
  pricingCategory: categorySchema,
});

export const linkExistingCarSchema = z.object({
  clientId: idSchema,
  carId: idSchema,
});

export const updateCarSchema = z.object({
  id: idSchema,
  brand: brandSchema,
  model: modelSchema,
  pricingCategory: categorySchema,
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type AddCarToClientInput = z.infer<typeof addCarToClientSchema>;
